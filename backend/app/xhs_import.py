from __future__ import annotations

import re
import time
import uuid
from collections import OrderedDict
from collections.abc import Callable
from dataclasses import dataclass
from html import unescape
from html.parser import HTMLParser
from urllib.parse import urljoin, urlsplit

import httpx

from app.errors import ApiError

ALLOWED_NOTE_HOSTS = frozenset(
    {
        "xiaohongshu.com",
        "www.xiaohongshu.com",
        "xhslink.com",
        "www.xhslink.com",
        "xhslink.cn",
        "www.xhslink.cn",
        "rednote.com",
        "www.rednote.com",
    }
)
SHARE_URL_PATTERN = re.compile(r"https?://[^\s<>\"']+", re.IGNORECASE)
IMAGE_URL_PATTERN = re.compile(
    r"https?://[^\"'<>\s]+\.xhscdn\.com[^\"'<>\s]*",
    re.IGNORECASE,
)
MAX_EXTRACTED_IMAGES = 20
MAX_REDIRECTS = 4
MAX_HTML_BYTES = 2 * 1024 * 1024
MAX_IMAGE_BYTES = 20 * 1024 * 1024
MAX_DOWNLOAD_BYTES = 100 * 1024 * 1024
UPSTREAM_TIMEOUT = httpx.Timeout(10.0, connect=5.0)
UPSTREAM_HEADERS = {
    "Accept": "text/html,application/xhtml+xml",
    "Accept-Language": "zh-CN,zh;q=0.9",
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
    ),
}


class _MetaContentParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.contents: list[str] = []

    def handle_starttag(
        self, tag: str, attrs: list[tuple[str, str | None]]
    ) -> None:
        if tag.lower() != "meta":
            return
        for name, value in attrs:
            if name.lower() == "content" and value:
                self.contents.append(value)


def _normalize_image_url(value: str) -> str | None:
    candidate = unescape(value).strip().rstrip(".,，。!?！？;；)]}）】")
    try:
        parsed = urlsplit(candidate)
        port = parsed.port
    except ValueError:
        return None
    hostname = parsed.hostname.lower() if parsed.hostname else ""
    if (
        parsed.scheme.lower() not in {"http", "https"}
        or not (hostname == "xhscdn.com" or hostname.endswith(".xhscdn.com"))
        or parsed.username is not None
        or parsed.password is not None
        or port not in {None, 80, 443}
    ):
        return None
    if parsed.scheme.lower() == "http":
        return parsed._replace(scheme="https").geturl()
    return candidate


def parse_image_urls(html_text: str) -> tuple[str, ...]:
    parser = _MetaContentParser()
    parser.feed(html_text)
    candidates = [*parser.contents, *IMAGE_URL_PATTERN.findall(html_text)]
    result: list[str] = []
    seen: set[str] = set()
    for candidate in candidates:
        normalized = _normalize_image_url(candidate)
        if normalized is None or normalized in seen:
            continue
        seen.add(normalized)
        result.append(normalized)
        if len(result) == MAX_EXTRACTED_IMAGES:
            break
    return tuple(result)


def _validate_note_url(candidate: str) -> str:
    try:
        parsed = urlsplit(candidate)
        port = parsed.port
    except ValueError as error:
        raise ApiError(400, "XHS_LINK_INVALID", "请粘贴有效的小红书分享链接。") from error
    if (
        parsed.scheme.lower() not in {"http", "https"}
        or parsed.hostname is None
        or parsed.hostname.lower() not in ALLOWED_NOTE_HOSTS
        or parsed.username is not None
        or parsed.password is not None
        or port not in {None, 80, 443}
    ):
        raise ApiError(400, "XHS_LINK_INVALID", "请粘贴有效的小红书分享链接。")
    return candidate


async def _fetch_note_html(client: httpx.AsyncClient, initial_url: str) -> str:
    current_url = _validate_note_url(initial_url)
    try:
        for redirect_count in range(MAX_REDIRECTS + 1):
            async with client.stream(
                "GET", current_url, headers=UPSTREAM_HEADERS
            ) as response:
                if response.status_code in {301, 302, 303, 307, 308}:
                    location = response.headers.get("location")
                    if location is None or redirect_count == MAX_REDIRECTS:
                        raise ApiError(
                            502,
                            "XHS_FETCH_FAILED",
                            "小红书链接跳转异常，请重新复制最新分享链接。",
                        )
                    current_url = _validate_note_url(
                        urljoin(str(response.url), location)
                    )
                    continue
                if response.status_code < 200 or response.status_code >= 300:
                    raise ApiError(
                        502,
                        "XHS_FETCH_FAILED",
                        "暂时无法读取这篇小红书笔记，请稍后重试。",
                    )
                content_type = response.headers.get("content-type", "")
                if content_type and "html" not in content_type.lower():
                    raise ApiError(
                        502,
                        "XHS_FETCH_FAILED",
                        "小红书分享页返回了无法识别的内容。",
                    )
                chunks: list[bytes] = []
                total_bytes = 0
                async for chunk in response.aiter_bytes():
                    total_bytes += len(chunk)
                    if total_bytes > MAX_HTML_BYTES:
                        raise ApiError(
                            413,
                            "XHS_LIMIT_EXCEEDED",
                            "小红书分享页内容过大，暂时无法处理。",
                        )
                    chunks.append(chunk)
                return b"".join(chunks).decode(
                    response.encoding or "utf-8", errors="replace"
                )
    except ApiError:
        raise
    except httpx.HTTPError as error:
        raise ApiError(
            502,
            "XHS_FETCH_FAILED",
            "暂时无法连接小红书，请稍后重试。",
        ) from error
    raise ApiError(
        502,
        "XHS_FETCH_FAILED",
        "暂时无法读取这篇小红书笔记，请稍后重试。",
    )


async def fetch_note_html(
    initial_url: str, *, client: httpx.AsyncClient | None = None
) -> str:
    if client is not None:
        return await _fetch_note_html(client, initial_url)
    async with httpx.AsyncClient(
        follow_redirects=False,
        timeout=UPSTREAM_TIMEOUT,
    ) as upstream:
        return await _fetch_note_html(upstream, initial_url)


@dataclass(frozen=True, slots=True)
class XhsExtraction:
    created_at: float
    image_urls: tuple[str, ...]


class XhsExtractionStore:
    def __init__(
        self,
        *,
        ttl_seconds: int = 600,
        maximum_sessions: int = 128,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self._ttl_seconds = ttl_seconds
        self._maximum_sessions = maximum_sessions
        self._clock = clock
        self._sessions: OrderedDict[str, XhsExtraction] = OrderedDict()

    def create(self, image_urls: tuple[str, ...]) -> str:
        now = self._clock()
        self._remove_expired(now)
        while len(self._sessions) >= self._maximum_sessions:
            self._sessions.popitem(last=False)
        extraction_id = str(uuid.uuid4())
        self._sessions[extraction_id] = XhsExtraction(now, image_urls)
        return extraction_id

    def get(self, extraction_id: str) -> XhsExtraction:
        now = self._clock()
        self._remove_expired(now)
        extraction = self._sessions.get(extraction_id)
        if extraction is None:
            raise ApiError(
                410,
                "XHS_EXTRACTION_EXPIRED",
                "图片提取结果已过期，请重新识别链接。",
            )
        return extraction

    def _remove_expired(self, now: float) -> None:
        expired_ids = [
            extraction_id
            for extraction_id, extraction in self._sessions.items()
            if now - extraction.created_at > self._ttl_seconds
        ]
        for extraction_id in expired_ids:
            del self._sessions[extraction_id]


EXTRACTION_STORE = XhsExtractionStore()


@dataclass(frozen=True, slots=True)
class FetchedImage:
    content: bytes
    mime_type: str
    extension: str


IMAGE_EXTENSIONS = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
}


async def create_extraction(share_text: str) -> tuple[str, tuple[str, ...]]:
    share_url = extract_share_url(share_text)
    html_text = await fetch_note_html(share_url)
    image_urls = parse_image_urls(html_text)
    if not image_urls:
        raise ApiError(
            422,
            "XHS_IMAGES_NOT_FOUND",
            "没有在这篇公开图文笔记中找到可提取的图片。",
        )
    return EXTRACTION_STORE.create(image_urls), image_urls


def extraction_image_url(extraction_id: str, image_id: int) -> str:
    extraction = EXTRACTION_STORE.get(extraction_id)
    if image_id < 0 or image_id >= len(extraction.image_urls):
        raise ApiError(404, "XHS_IMAGE_FAILED", "找不到这张提取图片。")
    return extraction.image_urls[image_id]


def _validate_image_url(url: str) -> str:
    normalized = _normalize_image_url(url)
    if normalized is None or not normalized.startswith("https://"):
        raise ApiError(502, "XHS_IMAGE_FAILED", "提取图片地址无效。")
    return normalized


async def _fetch_image_bytes(
    client: httpx.AsyncClient,
    url: str,
    *,
    maximum_bytes: int,
) -> FetchedImage:
    validated_url = _validate_image_url(url)
    try:
        async with client.stream(
            "GET",
            validated_url,
            headers={
                "Accept": "image/avif,image/webp,image/png,image/jpeg,*/*;q=0.8",
                "User-Agent": UPSTREAM_HEADERS["User-Agent"],
            },
        ) as response:
            if response.status_code < 200 or response.status_code >= 300:
                raise ApiError(
                    502,
                    "XHS_IMAGE_FAILED",
                    "暂时无法读取提取图片，请稍后重试。",
                )
            mime_type = response.headers.get("content-type", "").split(";", 1)[0].lower()
            extension = IMAGE_EXTENSIONS.get(mime_type)
            if extension is None:
                raise ApiError(
                    502,
                    "XHS_IMAGE_FAILED",
                    "小红书返回的内容不是支持的图片格式。",
                )
            content_length = response.headers.get("content-length")
            if content_length is not None:
                try:
                    declared_bytes = int(content_length)
                except ValueError:
                    declared_bytes = 0
                if declared_bytes > maximum_bytes:
                    raise ApiError(
                        413,
                        "XHS_LIMIT_EXCEEDED",
                        "提取图片过大，无法处理。",
                    )
            chunks: list[bytes] = []
            total_bytes = 0
            async for chunk in response.aiter_bytes():
                total_bytes += len(chunk)
                if total_bytes > maximum_bytes:
                    raise ApiError(
                        413,
                        "XHS_LIMIT_EXCEEDED",
                        "提取图片过大，无法处理。",
                    )
                chunks.append(chunk)
            return FetchedImage(b"".join(chunks), mime_type, extension)
    except ApiError:
        raise
    except httpx.HTTPError as error:
        raise ApiError(
            502,
            "XHS_IMAGE_FAILED",
            "暂时无法读取提取图片，请稍后重试。",
        ) from error


async def fetch_image_bytes(
    url: str,
    *,
    maximum_bytes: int = MAX_IMAGE_BYTES,
    client: httpx.AsyncClient | None = None,
) -> FetchedImage:
    if maximum_bytes <= 0:
        raise ApiError(413, "XHS_LIMIT_EXCEEDED", "提取图片总大小超过限制。")
    if client is not None:
        return await _fetch_image_bytes(client, url, maximum_bytes=maximum_bytes)
    async with httpx.AsyncClient(
        follow_redirects=False,
        timeout=UPSTREAM_TIMEOUT,
    ) as upstream:
        return await _fetch_image_bytes(upstream, url, maximum_bytes=maximum_bytes)


async def fetch_download_images(
    extraction_id: str,
    image_ids: list[int],
) -> list[FetchedImage]:
    remaining_bytes = MAX_DOWNLOAD_BYTES
    images: list[FetchedImage] = []
    for image_id in image_ids:
        url = extraction_image_url(extraction_id, image_id)
        image = await fetch_image_bytes(
            url,
            maximum_bytes=min(MAX_IMAGE_BYTES, remaining_bytes),
        )
        images.append(image)
        remaining_bytes -= len(image.content)
    return images


def extract_share_url(share_text: str) -> str:
    for match in SHARE_URL_PATTERN.finditer(share_text):
        candidate = match.group(0).rstrip(".,，。!?！？;；:：)]}）】")
        try:
            return _validate_note_url(candidate)
        except ApiError:
            continue
    raise ApiError(400, "XHS_LINK_INVALID", "请粘贴有效的小红书分享链接。")
