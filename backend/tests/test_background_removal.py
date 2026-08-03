from __future__ import annotations

import asyncio
import io
import json
from collections.abc import Callable
from pathlib import Path

import pytest
from fastapi import UploadFile
from fastapi.testclient import TestClient
from PIL import Image
from starlette.datastructures import Headers

from app import background_removal, limits
from conftest import assert_structured_chinese_error


class FakeBackgroundRemovalRuntime:
    def __init__(self, *, failure: Exception | None = None) -> None:
        self.failure = failure
        self.calls = 0

    def remove(self, source: Image.Image) -> Image.Image:
        self.calls += 1
        if self.failure is not None:
            raise self.failure
        result = source.convert("RGBA")
        alpha = Image.new("L", result.size, 255)
        alpha.putpixel((0, 0), 0)
        result.putalpha(alpha)
        return result


@pytest.fixture
def fake_runtime(
    monkeypatch: pytest.MonkeyPatch,
) -> FakeBackgroundRemovalRuntime:
    runtime = FakeBackgroundRemovalRuntime()
    monkeypatch.setattr(
        background_removal,
        "BACKGROUND_REMOVAL_RUNTIME",
        runtime,
        raising=False,
    )
    return runtime


def encode_image(image: Image.Image, format_name: str) -> bytes:
    output = io.BytesIO()
    image.save(output, format=format_name)
    return output.getvalue()


def test_model_absence_returns_a_stable_unavailable_error(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
    png_bytes: Callable[[Image.Image], bytes],
    tmp_path: Path,
) -> None:
    monkeypatch.setattr(
        background_removal,
        "BACKGROUND_REMOVAL_RUNTIME",
        background_removal.BackgroundRemovalRuntime(
            tmp_path / "missing-manifest.json"
        ),
    )
    response = client.post(
        "/api/image/remove-background",
        files={
            "file": (
                "subject.png",
                png_bytes(Image.new("RGB", (4, 3), "white")),
                "image/png",
            )
        },
    )

    assert_structured_chinese_error(
        response,
        "BACKGROUND_REMOVAL_UNAVAILABLE",
        expected_status=503,
    )
    assert response.json()["error"]["message"] == (
        "一键去背景当前不可用。请联系服务维护者安装模型后重试。"
    )
    assert response.headers["cache-control"] == "no-store"


@pytest.mark.parametrize(
    ("format_name", "mime_type"),
    [
        ("JPEG", "image/jpeg"),
        ("PNG", "image/png"),
        ("WEBP", "image/webp"),
    ],
)
def test_supported_formats_return_same_size_rgba_png_with_transparency(
    client: TestClient,
    fake_runtime: FakeBackgroundRemovalRuntime,
    format_name: str,
    mime_type: str,
) -> None:
    response = client.post(
        "/api/image/remove-background",
        files={
            "file": (
                "subject",
                encode_image(Image.new("RGB", (7, 5), "#336699"), format_name),
                mime_type,
            )
        },
    )

    assert response.status_code == 200
    assert response.headers["content-type"] == "image/png"
    assert response.headers["cache-control"] == "no-store"
    with Image.open(io.BytesIO(response.content)) as result:
        result.load()
        assert result.format == "PNG"
        assert result.mode == "RGBA"
        assert result.size == (7, 5)
        assert result.getpixel((0, 0))[3] == 0
        assert result.getpixel((1, 0))[3] == 255
    assert fake_runtime.calls == 1


def test_mismatched_declared_mime_is_accepted_when_content_supported(
    client: TestClient,
    fake_runtime: FakeBackgroundRemovalRuntime,
    png_bytes: Callable[[Image.Image], bytes],
) -> None:
    # 声明类型与实际内容不符时，以实际解码格式为准。
    response = client.post(
        "/api/image/remove-background",
        files={
            "file": (
                "subject.jpg",
                png_bytes(Image.new("RGB", (2, 2), "white")),
                "image/jpeg",
            )
        },
    )

    assert response.status_code == 200
    assert response.headers["content-type"] == "image/png"
    assert fake_runtime.calls == 1


def test_empty_and_oversized_uploads_reuse_stable_upload_errors(
    client: TestClient,
    fake_runtime: FakeBackgroundRemovalRuntime,
    monkeypatch: pytest.MonkeyPatch,
    png_bytes: Callable[[Image.Image], bytes],
) -> None:
    empty_response = client.post(
        "/api/image/remove-background",
        files={"file": ("empty.png", b"", "image/png")},
    )
    image_bytes = png_bytes(Image.new("RGB", (2, 2), "white"))
    monkeypatch.setattr(limits, "MAX_UPLOAD_BYTES", len(image_bytes) - 1)
    oversized_response = client.post(
        "/api/image/remove-background",
        files={"file": ("large.png", image_bytes, "image/png")},
    )

    assert_structured_chinese_error(empty_response, "IMAGE_EMPTY")
    assert_structured_chinese_error(
        oversized_response,
        "IMAGE_UPLOAD_TOO_LARGE",
        expected_status=413,
    )
    assert fake_runtime.calls == 0


def test_background_removal_uses_its_own_decoded_pixel_limit(
    client: TestClient,
    fake_runtime: FakeBackgroundRemovalRuntime,
    monkeypatch: pytest.MonkeyPatch,
    png_bytes: Callable[[Image.Image], bytes],
) -> None:
    monkeypatch.setattr(
        limits,
        "MAX_BACKGROUND_REMOVAL_DECODED_PIXELS",
        5,
    )
    response = client.post(
        "/api/image/remove-background",
        files={
            "file": (
                "six-pixels.png",
                png_bytes(Image.new("RGB", (3, 2), "white")),
                "image/png",
            )
        },
    )

    assert_structured_chinese_error(
        response,
        "BACKGROUND_REMOVAL_PIXEL_LIMIT_EXCEEDED",
        expected_status=413,
    )
    assert response.json()["error"]["message"] == (
        "图片像素过多，无法安全执行一键去背景。请缩小图片后重试。"
    )
    assert fake_runtime.calls == 0


def test_inference_failure_returns_a_deterministic_error(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
    png_bytes: Callable[[Image.Image], bytes],
) -> None:
    runtime = FakeBackgroundRemovalRuntime(failure=RuntimeError("private detail"))
    monkeypatch.setattr(
        background_removal,
        "BACKGROUND_REMOVAL_RUNTIME",
        runtime,
        raising=False,
    )
    response = client.post(
        "/api/image/remove-background",
        files={
            "file": (
                "subject.png",
                png_bytes(Image.new("RGB", (2, 2), "white")),
                "image/png",
            )
        },
    )

    assert_structured_chinese_error(
        response,
        "BACKGROUND_REMOVAL_FAILED",
        expected_status=500,
    )
    assert response.json()["error"]["message"] == (
        "无法完成一键去背景。原图和当前图纸已保留，请稍后重试。"
    )
    assert "private detail" not in response.text


def test_successful_inference_does_not_create_temporary_files(
    client: TestClient,
    fake_runtime: FakeBackgroundRemovalRuntime,
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
    png_bytes: Callable[[Image.Image], bytes],
) -> None:
    monkeypatch.chdir(tmp_path)
    response = client.post(
        "/api/image/remove-background",
        files={
            "file": (
                "subject.png",
                png_bytes(Image.new("RGB", (3, 3), "white")),
                "image/png",
            )
        },
    )

    assert response.status_code == 200
    assert list(tmp_path.iterdir()) == []


def test_exif_orientation_is_normalized_before_inference(
    client: TestClient,
    fake_runtime: FakeBackgroundRemovalRuntime,
) -> None:
    stored = Image.new("RGB", (2, 3), "white")
    exif = stored.getexif()
    exif[274] = 6
    encoded = io.BytesIO()
    stored.save(encoded, format="JPEG", exif=exif)

    response = client.post(
        "/api/image/remove-background",
        files={"file": ("oriented.jpg", encoded.getvalue(), "image/jpeg")},
    )

    assert response.status_code == 200
    with Image.open(io.BytesIO(response.content)) as result:
        assert result.size == (3, 2)
    assert fake_runtime.calls == 1


def test_upload_is_closed_after_success(
    fake_runtime: FakeBackgroundRemovalRuntime,
    png_bytes: Callable[[Image.Image], bytes],
) -> None:
    upload = UploadFile(
        file=io.BytesIO(png_bytes(Image.new("RGB", (2, 2), "white"))),
        filename="subject.png",
        headers=Headers({"content-type": "image/png"}),
    )

    asyncio.run(background_removal.create_background_removed_png(upload))

    assert upload.file.closed


def test_rembg_engine_initializes_once_and_reuses_one_session(
    tmp_path: Path,
) -> None:
    engine_class = getattr(
        background_removal,
        "RembgBackgroundRemovalEngine",
        None,
    )
    assert engine_class is not None, "缺少 rembg 背景移除引擎"
    sessions: list[object] = []
    used_sessions: list[object] = []

    def session_factory(_model_path: Path) -> object:
        session = object()
        sessions.append(session)
        return session

    def remover(
        source: Image.Image,
        *,
        session: object,
    ) -> Image.Image:
        used_sessions.append(session)
        return source.convert("RGBA")

    engine = engine_class(
        tmp_path / "model.onnx",
        session_factory=session_factory,
        remover=remover,
    )
    first = engine.remove(Image.new("RGB", (2, 2), "white"))
    second = engine.remove(Image.new("RGB", (2, 2), "black"))

    assert len(sessions) == 1
    assert used_sessions == [sessions[0], sessions[0]]
    assert first.mode == "RGBA"
    assert second.mode == "RGBA"


def test_initialization_failure_marks_runtime_unavailable(
    tmp_path: Path,
) -> None:
    runtime_class = getattr(
        background_removal,
        "BackgroundRemovalRuntime",
        None,
    )
    assert runtime_class is not None, "缺少背景移除 runtime"
    model_bytes = b"verified model"
    model_path = tmp_path / "birefnet-general-lite.onnx"
    model_path.write_bytes(model_bytes)
    manifest_path = tmp_path / "background-removal-model.json"
    manifest_path.write_text(
        json.dumps(
            {
                "manifestVersion": "1.0",
                "model": {
                    "expectedFilename": model_path.name,
                    "sizeBytes": len(model_bytes),
                    "sha256": __import__("hashlib").sha256(
                        model_bytes
                    ).hexdigest(),
                },
            }
        ),
        encoding="utf-8",
    )
    runtime = runtime_class(
        manifest_path,
        engine_factory=lambda _path: (_ for _ in ()).throw(
            RuntimeError("cannot initialize")
        ),
    )

    assert runtime.capability()["available"] is True
    with pytest.raises(background_removal.BackgroundRemovalUnavailableError):
        runtime.remove(Image.new("RGB", (1, 1), "white"))
    assert runtime.capability()["available"] is False
    assert (
        runtime.capability()["unavailableReason"]
        == "ENGINE_INITIALIZATION_FAILED"
    )


def test_project_model_manifest_pins_selected_general_model() -> None:
    manifest_path = (
        Path(__file__).resolve().parents[1]
        / "models"
        / "background-removal-model.json"
    )
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))

    assert manifest["engine"] == {
        "name": "rembg",
        "version": "2.0.76",
        "source": "https://github.com/danielgatis/rembg/tree/v2.0.76",
        "license": "MIT",
        "licenseSource": (
            "https://github.com/danielgatis/rembg/blob/v2.0.76/LICENSE.txt"
        ),
    }
    assert manifest["model"] == {
        "id": "isnet-general-use",
        "version": "DIS-isnet-general-use-2022-08-17",
        "source": (
            "https://github.com/danielgatis/rembg/releases/download/"
            "v0.0.0/isnet-general-use.onnx"
        ),
        "upstreamCommit": (
            "b6764e20381f6f42a70f83fa3324181529ed1403"
        ),
        "upstreamSource": (
            "https://github.com/xuebinqin/DIS/tree/"
            "b6764e20381f6f42a70f83fa3324181529ed1403"
        ),
        "license": "Apache-2.0",
        "licenseSource": (
            "https://github.com/xuebinqin/DIS/blob/"
            "b6764e20381f6f42a70f83fa3324181529ed1403/"
            "LICENSE.md"
        ),
        "expectedFilename": "isnet-general-use.onnx",
        "sizeBytes": 178_648_008,
        "sha256": (
            "60920e99c45464f2ba57bee2ad08c919"
            "a52bbf852739e96947fbb4358c0d964a"
        ),
    }
