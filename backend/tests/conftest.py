from __future__ import annotations

import hashlib
import io
from collections.abc import Callable
from typing import Any

import numpy as np
import pytest
from fastapi.testclient import TestClient
from PIL import Image, ImageOps

from app.main import app


@pytest.fixture
def client() -> TestClient:
    with TestClient(app, raise_server_exceptions=False) as test_client:
        yield test_client


@pytest.fixture
def png_bytes() -> Callable[[Image.Image], bytes]:
    def encode(image: Image.Image) -> bytes:
        output = io.BytesIO()
        image.save(output, format="PNG")
        return output.getvalue()

    return encode


@pytest.fixture
def generated_rgba_image() -> Image.Image:
    pixels = np.zeros((6, 8, 4), dtype=np.uint8)
    for y in range(6):
        for x in range(8):
            pixels[y, x] = (
                (x * 31 + y * 7) % 256,
                (x * 13 + y * 43) % 256,
                (x * 53 + y * 17) % 256,
                (x * 29 + y * 11) % 256,
            )
    return Image.fromarray(pixels, mode="RGBA")


def make_contract(
    image_bytes: bytes,
    *,
    width: int,
    height: int,
    cell_size: int,
    x_boundaries: list[int],
    y_boundaries: list[int],
    confirmed: bool = True,
) -> dict[str, Any]:
    return {
        "imageSha256": hashlib.sha256(image_bytes).hexdigest(),
        "naturalWidth": width,
        "naturalHeight": height,
        "cellSize": cell_size,
        "columns": len(x_boundaries) - 1,
        "rows": len(y_boundaries) - 1,
        "xBoundaries": x_boundaries,
        "yBoundaries": y_boundaries,
        "confirmed": confirmed,
    }


def decode_normalized_rgba(image_bytes: bytes) -> Image.Image:
    with Image.open(io.BytesIO(image_bytes)) as decoded:
        decoded.load()
        normalized = ImageOps.exif_transpose(decoded)
        return normalized.convert("RGBA")


def numpy_reference_mirror(
    source: Image.Image, contract: dict[str, Any]
) -> Image.Image:
    source_pixels = np.asarray(source.convert("RGBA"))
    result_pixels = source_pixels.copy()
    left = contract["xBoundaries"][0]
    right = contract["xBoundaries"][-1]
    top = contract["yBoundaries"][0]
    bottom = contract["yBoundaries"][-1]
    rows = contract["rows"]
    columns = contract["columns"]
    cell_size = contract["cellSize"]

    grid = source_pixels[top:bottom, left:right]
    cells = grid.reshape(rows, cell_size, columns, cell_size, 4)
    result_pixels[top:bottom, left:right] = cells[:, :, ::-1, :, :].reshape(
        rows * cell_size, columns * cell_size, 4
    )
    return Image.fromarray(result_pixels, mode="RGBA")


def assert_structured_chinese_error(
    response: Any, expected_code: str, expected_status: int = 422
) -> None:
    assert response.status_code == expected_status
    payload = response.json()
    assert set(payload) == {"error"}
    assert payload["error"]["code"] == expected_code
    message = payload["error"]["message"]
    assert isinstance(message, str)
    assert any("\u4e00" <= character <= "\u9fff" for character in message)
