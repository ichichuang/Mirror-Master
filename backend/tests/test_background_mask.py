from __future__ import annotations

import io
import json
from collections.abc import Callable

import numpy as np
import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app import background_removal
from conftest import assert_structured_chinese_error


class FakeMaskRuntime:
    """模拟主体识别：上半部分保留、下半部分去除。"""

    def mask(self, source: Image.Image) -> Image.Image:
        width, height = source.size
        mask_array = np.zeros((height, width), dtype=np.uint8)
        mask_array[: height // 2, :] = 255
        return Image.fromarray(mask_array, mode="L")


@pytest.fixture
def fake_mask_runtime(monkeypatch: pytest.MonkeyPatch) -> FakeMaskRuntime:
    runtime = FakeMaskRuntime()
    monkeypatch.setattr(
        background_removal,
        "BACKGROUND_REMOVAL_RUNTIME",
        runtime,
        raising=False,
    )
    monkeypatch.setattr(
        "app.background_mask.BACKGROUND_REMOVAL_RUNTIME",
        runtime,
        raising=False,
    )
    return runtime


def _subject_image() -> Image.Image:
    """白色背景上的纯红色方块，GrabCut 应吸附到方块边缘。"""
    pixels = np.full((120, 160, 3), 255, dtype=np.uint8)
    pixels[30:90, 40:120] = (200, 30, 30)
    return Image.fromarray(pixels, mode="RGB")


def _blank_mask_bytes(size: tuple[int, int]) -> bytes:
    output = io.BytesIO()
    Image.new("L", size, 0).save(output, format="PNG")
    return output.getvalue()


def _png(image: Image.Image) -> bytes:
    output = io.BytesIO()
    image.save(output, format="PNG")
    return output.getvalue()


def test_mask_endpoint_returns_same_size_grayscale_mask(
    client: TestClient,
    fake_mask_runtime: FakeMaskRuntime,
) -> None:
    response = client.post(
        "/api/image/remove-background/mask",
        files={"file": ("subject.png", _png(_subject_image()), "image/png")},
    )

    assert response.status_code == 200
    assert response.headers["content-type"] == "image/png"
    assert response.headers["cache-control"] == "no-store"
    with Image.open(io.BytesIO(response.content)) as result:
        result.load()
        assert result.size == (160, 120)
        assert result.mode == "L"
        values = np.asarray(result)
        assert values[10, 80] == 255
        assert values[110, 80] == 0


def test_mask_endpoint_reports_unavailable_when_model_missing(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
    tmp_path,
) -> None:
    runtime = background_removal.BackgroundRemovalRuntime(
        tmp_path / "missing-manifest.json"
    )
    monkeypatch.setattr(
        background_removal, "BACKGROUND_REMOVAL_RUNTIME", runtime, raising=False
    )
    monkeypatch.setattr(
        "app.background_mask.BACKGROUND_REMOVAL_RUNTIME", runtime, raising=False
    )
    response = client.post(
        "/api/image/remove-background/mask",
        files={
            "file": (
                "subject.png",
                _png(Image.new("RGB", (4, 3), "white")),
                "image/png",
            )
        },
    )

    assert_structured_chinese_error(
        response, "BACKGROUND_REMOVAL_UNAVAILABLE", expected_status=503
    )


def test_refine_snaps_user_stroke_to_color_edge(
    client: TestClient,
    fake_mask_runtime: FakeMaskRuntime,
) -> None:
    # 初始蒙版为全背景，用户在红色方块中心涂抹一小笔“保留”，
    # GrabCut 应把选区扩展到整个红色方块而不溢出到白色背景。
    strokes = {
        "strokes": [
            {
                "mode": "keep",
                "radius": 6,
                "points": [[80, 60]],
            }
        ]
    }
    response = client.post(
        "/api/image/remove-background/refine",
        files={
            "file": ("subject.png", _png(_subject_image()), "image/png"),
            "mask": (
                "mask.png",
                _blank_mask_bytes((160, 120)),
                "image/png",
            ),
        },
        data={"strokes": json.dumps(strokes)},
    )

    assert response.status_code == 200
    with Image.open(io.BytesIO(response.content)) as result:
        result.load()
        assert result.size == (160, 120)
        values = np.asarray(result)
        # 方块内部（远离笔刷中心）被吸附为保留
        assert values[45, 100] == 255
        assert values[60, 60] == 255
        # 方块外白色背景保持去除
        assert values[10, 10] == 0
        assert values[110, 150] == 0
        # 吸附区域不应覆盖全图
        coverage = float(np.count_nonzero(values)) / values.size
        assert 0.05 < coverage < 0.8


def test_refine_single_class_window_applies_strokes_directly(
    client: TestClient,
    fake_mask_runtime: FakeMaskRuntime,
) -> None:
    # 窗口内蒙版全为前景、用户只涂“保留”时，GrabCut 无法建模，
    # 必须退化为直接应用笔刷，而不是 500。
    full_mask = io.BytesIO()
    Image.new("L", (160, 120), 255).save(full_mask, format="PNG")
    strokes = {
        "strokes": [{"mode": "keep", "radius": 6, "points": [[80, 60]]}]
    }
    response = client.post(
        "/api/image/remove-background/refine",
        files={
            "file": ("subject.png", _png(_subject_image()), "image/png"),
            "mask": ("mask.png", full_mask.getvalue(), "image/png"),
        },
        data={"strokes": json.dumps(strokes)},
    )

    assert response.status_code == 200
    with Image.open(io.BytesIO(response.content)) as result:
        result.load()
        values = np.asarray(result)
        assert values[60, 80] == 255
        assert values[0, 0] == 255


def test_refine_remove_stroke_clears_region(
    client: TestClient,
    fake_mask_runtime: FakeMaskRuntime,
) -> None:
    strokes = {
        "strokes": [
            {
                "mode": "remove",
                "radius": 8,
                "points": [[80, 60]],
            }
        ]
    }
    full_mask = io.BytesIO()
    Image.new("L", (160, 120), 255).save(full_mask, format="PNG")
    response = client.post(
        "/api/image/remove-background/refine",
        files={
            "file": ("subject.png", _png(_subject_image()), "image/png"),
            "mask": ("mask.png", full_mask.getvalue(), "image/png"),
        },
        data={"strokes": json.dumps(strokes)},
    )

    assert response.status_code == 200
    with Image.open(io.BytesIO(response.content)) as result:
        result.load()
        values = np.asarray(result)
        assert values[60, 80] == 0


def test_refine_rejects_invalid_strokes(
    client: TestClient,
    fake_mask_runtime: FakeMaskRuntime,
) -> None:
    response = client.post(
        "/api/image/remove-background/refine",
        files={
            "file": ("subject.png", _png(_subject_image()), "image/png"),
            "mask": (
                "mask.png",
                _blank_mask_bytes((160, 120)),
                "image/png",
            ),
        },
        data={"strokes": "{\"strokes\": []}"},
    )

    assert_structured_chinese_error(response, "BACKGROUND_REMOVAL_STROKES_INVALID")


def test_refine_rejects_size_mismatched_mask(
    client: TestClient,
    fake_mask_runtime: FakeMaskRuntime,
) -> None:
    strokes = {
        "strokes": [{"mode": "keep", "radius": 5, "points": [[10, 10]]}]
    }
    response = client.post(
        "/api/image/remove-background/refine",
        files={
            "file": ("subject.png", _png(_subject_image()), "image/png"),
            "mask": ("mask.png", _blank_mask_bytes((80, 60)), "image/png"),
        },
        data={"strokes": json.dumps(strokes)},
    )

    assert_structured_chinese_error(response, "BACKGROUND_REMOVAL_MASK_INVALID")


def test_apply_composites_mask_as_alpha(
    client: TestClient,
    fake_mask_runtime: FakeMaskRuntime,
) -> None:
    mask_array = np.zeros((120, 160), dtype=np.uint8)
    mask_array[30:90, 40:120] = 255
    mask_output = io.BytesIO()
    Image.fromarray(mask_array, mode="L").save(mask_output, format="PNG")

    response = client.post(
        "/api/image/remove-background/apply",
        files={
            "file": ("subject.png", _png(_subject_image()), "image/png"),
            "mask": ("mask.png", mask_output.getvalue(), "image/png"),
        },
    )

    assert response.status_code == 200
    assert response.headers["content-type"] == "image/png"
    with Image.open(io.BytesIO(response.content)) as result:
        result.load()
        assert result.size == (160, 120)
        assert result.mode == "RGBA"
        values = np.asarray(result)
        assert values[60, 80, 3] == 255
        assert values[60, 80, 0] == 200
        assert values[10, 10, 3] == 0


def test_capabilities_expose_interactive_contract(
    client: TestClient,
) -> None:
    response = client.get("/api/capabilities")

    assert response.status_code == 200
    removal = response.json()["backgroundRemoval"]
    interactive = removal["interactive"]
    assert interactive["contractVersion"] == "1.0"
    assert interactive["refinement"] == "grabcut"
    assert interactive["available"] is True
    assert interactive["maximumStrokesPerRequest"] >= 1
    assert interactive["maximumBrushRadiusPx"] > interactive["minimumBrushRadiusPx"]


def test_old_remove_background_endpoint_still_works(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class LegacyRuntime:
        def remove(self, source: Image.Image) -> Image.Image:
            result = source.convert("RGBA")
            alpha = Image.new("L", result.size, 255)
            result.putalpha(alpha)
            return result

    monkeypatch.setattr(
        background_removal,
        "BACKGROUND_REMOVAL_RUNTIME",
        LegacyRuntime(),
        raising=False,
    )
    response = client.post(
        "/api/image/remove-background",
        files={
            "file": (
                "subject.png",
                _png(Image.new("RGB", (7, 5), "#336699")),
                "image/png",
            )
        },
    )

    assert response.status_code == 200
    assert response.headers["content-type"] == "image/png"


@pytest.mark.parametrize("bad_payload", ["not-json", "[]", "{\"strokes\": {}}"])
def test_refine_rejects_malformed_stroke_payloads(
    client: TestClient,
    fake_mask_runtime: FakeMaskRuntime,
    bad_payload: str,
) -> None:
    response = client.post(
        "/api/image/remove-background/refine",
        files={
            "file": ("subject.png", _png(_subject_image()), "image/png"),
            "mask": (
                "mask.png",
                _blank_mask_bytes((160, 120)),
                "image/png",
            ),
        },
        data={"strokes": bad_payload},
    )

    assert_structured_chinese_error(response, "BACKGROUND_REMOVAL_STROKES_INVALID")


CallableFixture = Callable[[Image.Image], bytes]
