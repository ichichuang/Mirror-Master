from __future__ import annotations

import asyncio
import io
import zipfile

import httpx
import pytest
from fastapi.testclient import TestClient

from app import xhs_import
from app.errors import ApiError
from conftest import assert_structured_chinese_error


def test_extraction_rejects_text_without_a_supported_share_link(
    client: TestClient,
) -> None:
    response = client.post(
        "/api/xhs/extractions",
        json={"shareText": "这里没有小红书链接"},
    )

    assert_structured_chinese_error(
        response,
        "XHS_LINK_INVALID",
        expected_status=400,
    )


def test_share_text_returns_the_first_supported_xiaohongshu_url() -> None:
    assert xhs_import.extract_share_url(
        "复制这段文字 https://xhslink.com/a/abc123?xsec_token=token 打开小红书"
    ) == "https://xhslink.com/a/abc123?xsec_token=token"

    try:
        xhs_import.extract_share_url("https://xhslink.com.evil.example/note")
    except ApiError as error:
        assert error.code == "XHS_LINK_INVALID"
    else:
        raise AssertionError("伪造的小红书子域名必须被拒绝")


def test_shortcut_style_meta_images_are_unescaped_upgraded_and_deduplicated() -> None:
    html = """
      <html><head>
        <meta content="http://sns-webpic-qc.xhscdn.com/one.jpg?a=1&amp;b=2">
        <meta property="og:image" content="https://sns-webpic-qc.xhscdn.com/two.webp">
        <meta property="og:image" content="http://sns-webpic-qc.xhscdn.com/one.jpg?a=1&amp;b=2">
        <meta property="og:image" content="https://images.example.com/not-xhs.jpg">
      </head></html>
    """

    assert xhs_import.parse_image_urls(html) == (
        "https://sns-webpic-qc.xhscdn.com/one.jpg?a=1&b=2",
        "https://sns-webpic-qc.xhscdn.com/two.webp",
    )


def test_malformed_cdn_port_is_ignored_instead_of_crashing_parser() -> None:
    html = """
      <meta content="https://sns-webpic-qc.xhscdn.com:invalid/image.jpg">
      <meta content="https://sns-webpic-qc.xhscdn.com/valid.jpg">
    """

    assert xhs_import.parse_image_urls(html) == (
        "https://sns-webpic-qc.xhscdn.com/valid.jpg",
    )


def test_cdn_regex_fallback_preserves_order_and_caps_results_at_twenty() -> None:
    html = " ".join(
        f'https://sns-webpic-qc.xhscdn.com/{index}.jpg' for index in range(25)
    )

    result = xhs_import.parse_image_urls(html)

    assert len(result) == 20
    assert result[0].endswith("/0.jpg")
    assert result[-1].endswith("/19.jpg")


def test_note_fetch_follows_only_validated_redirects_and_limits_html() -> None:
    requested_hosts: list[str] = []

    def handle(request: httpx.Request) -> httpx.Response:
        requested_hosts.append(request.url.host)
        if request.url.host == "xhslink.com":
            return httpx.Response(
                302,
                headers={
                    "location": "https://www.xiaohongshu.com/explore/note-id"
                },
            )
        return httpx.Response(
            200,
            headers={"content-type": "text/html; charset=utf-8"},
            text='<meta content="https://sns-webpic-qc.xhscdn.com/one.jpg">',
        )

    async def run() -> str:
        async with httpx.AsyncClient(
            transport=httpx.MockTransport(handle)
        ) as upstream:
            return await xhs_import.fetch_note_html(
                "https://xhslink.com/a/short",
                client=upstream,
            )

    assert "one.jpg" in asyncio.run(run())
    assert requested_hosts == ["xhslink.com", "www.xiaohongshu.com"]

    def redirect_to_private(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(302, headers={"location": "http://127.0.0.1/admin"})

    async def run_private_redirect() -> None:
        async with httpx.AsyncClient(
            transport=httpx.MockTransport(redirect_to_private)
        ) as upstream:
            await xhs_import.fetch_note_html(
                "https://xhslink.com/a/short",
                client=upstream,
            )

    try:
        asyncio.run(run_private_redirect())
    except ApiError as error:
        assert error.code == "XHS_LINK_INVALID"
    else:
        raise AssertionError("跳转到非小红书主机必须被拒绝")


def test_extraction_store_expires_sessions_and_evicts_the_oldest() -> None:
    now = [1000.0]
    store = xhs_import.XhsExtractionStore(
        ttl_seconds=600,
        maximum_sessions=2,
        clock=lambda: now[0],
    )
    first_id = store.create(("https://a.xhscdn.com/first.jpg",))
    now[0] += 1
    second_id = store.create(("https://a.xhscdn.com/second.jpg",))
    now[0] += 1
    third_id = store.create(("https://a.xhscdn.com/third.jpg",))

    assert store.get(second_id).image_urls[0].endswith("second.jpg")
    assert store.get(third_id).image_urls[0].endswith("third.jpg")
    try:
        store.get(first_id)
    except ApiError as error:
        assert error.code == "XHS_EXTRACTION_EXPIRED"
    else:
        raise AssertionError("容量淘汰后不得读取最早会话")

    now[0] += 601
    try:
        store.get(third_id)
    except ApiError as error:
        assert error.status_code == 410
    else:
        raise AssertionError("超过 TTL 的会话必须过期")


def test_create_extraction_returns_only_opaque_same_origin_image_urls(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def fake_fetch_note_html(_url: str) -> str:
        return """
          <meta content="https://sns-webpic-qc.xhscdn.com/one.jpg">
          <meta content="https://sns-webpic-qc.xhscdn.com/two.webp">
        """

    monkeypatch.setattr(xhs_import, "fetch_note_html", fake_fetch_note_html)
    monkeypatch.setattr(
        xhs_import,
        "EXTRACTION_STORE",
        xhs_import.XhsExtractionStore(),
        raising=False,
    )

    response = client.post(
        "/api/xhs/extractions",
        json={"shareText": "复制 https://xhslink.com/a/short 打开小红书"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert set(payload) == {"extractionId", "images"}
    assert len(payload["extractionId"]) == 36
    assert payload["images"] == [
        {
            "id": 0,
            "previewUrl": (
                f'/api/xhs/extractions/{payload["extractionId"]}/images/0'
            ),
        },
        {
            "id": 1,
            "previewUrl": (
                f'/api/xhs/extractions/{payload["extractionId"]}/images/1'
            ),
        },
    ]
    assert "xhscdn.com" not in response.text
    assert response.headers["cache-control"] == "no-store"


def test_image_proxy_and_multi_image_download_use_the_server_session(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    store = xhs_import.XhsExtractionStore()
    extraction_id = store.create(
        (
            "https://sns-webpic-qc.xhscdn.com/one.jpg",
            "https://sns-webpic-qc.xhscdn.com/two.webp",
        )
    )
    monkeypatch.setattr(xhs_import, "EXTRACTION_STORE", store, raising=False)
    fetched_urls: list[str] = []

    async def fake_fetch_image_bytes(
        url: str, *, maximum_bytes: int = xhs_import.MAX_IMAGE_BYTES
    ) -> xhs_import.FetchedImage:
        fetched_urls.append(url)
        if url.endswith(".webp"):
            return xhs_import.FetchedImage(b"webp-image", "image/webp", "webp")
        return xhs_import.FetchedImage(b"jpeg-image", "image/jpeg", "jpg")

    monkeypatch.setattr(
        xhs_import,
        "fetch_image_bytes",
        fake_fetch_image_bytes,
        raising=False,
    )

    image_response = client.get(
        f"/api/xhs/extractions/{extraction_id}/images/0"
    )
    assert image_response.status_code == 200
    assert image_response.content == b"jpeg-image"
    assert image_response.headers["content-type"] == "image/jpeg"
    assert "content-disposition" not in image_response.headers

    zip_response = client.post(
        f"/api/xhs/extractions/{extraction_id}/download",
        json={"imageIds": [1, 0]},
    )
    assert zip_response.status_code == 200
    assert zip_response.headers["content-type"] == "application/zip"
    assert "xiaohongshu-images.zip" in zip_response.headers["content-disposition"]
    with zipfile.ZipFile(io.BytesIO(zip_response.content)) as archive:
        assert archive.namelist() == [
            "xiaohongshu-01.webp",
            "xiaohongshu-02.jpg",
        ]
        assert archive.read("xiaohongshu-01.webp") == b"webp-image"
        assert archive.read("xiaohongshu-02.jpg") == b"jpeg-image"
    assert fetched_urls == [
        "https://sns-webpic-qc.xhscdn.com/one.jpg",
        "https://sns-webpic-qc.xhscdn.com/two.webp",
        "https://sns-webpic-qc.xhscdn.com/one.jpg",
    ]


def test_fetch_image_rejects_non_image_content_and_oversized_bytes() -> None:
    def html_response(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            headers={"content-type": "text/html"},
            content=b"not an image",
        )

    async def run_with_transport(
        handler: object, maximum_bytes: int
    ) -> xhs_import.FetchedImage:
        async with httpx.AsyncClient(
            transport=httpx.MockTransport(handler)  # type: ignore[arg-type]
        ) as upstream:
            return await xhs_import.fetch_image_bytes(
                "https://sns-webpic-qc.xhscdn.com/image.jpg",
                maximum_bytes=maximum_bytes,
                client=upstream,
            )

    with pytest.raises(ApiError, match="图片") as wrong_type:
        asyncio.run(run_with_transport(html_response, 20))
    assert wrong_type.value.code == "XHS_IMAGE_FAILED"

    def large_image(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            headers={"content-type": "image/jpeg"},
            content=b"123456",
        )

    with pytest.raises(ApiError) as oversized:
        asyncio.run(run_with_transport(large_image, 5))
    assert oversized.value.code == "XHS_LIMIT_EXCEEDED"
