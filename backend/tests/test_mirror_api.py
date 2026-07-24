from __future__ import annotations

import asyncio
import copy
import hashlib
import io
import json

import numpy as np
import pytest
from fastapi import UploadFile
from fastapi.testclient import TestClient
from PIL import Image
from starlette.datastructures import Headers

from app import limits
from app.service import create_mirror_png
from conftest import (
    assert_structured_chinese_error,
    decode_normalized_rgba,
    make_contract,
    numpy_reference_mirror,
)


def post_mirror(
    client: TestClient,
    image_bytes: bytes,
    contract: dict[str, object] | str,
    *,
    mime_type: str = "image/png",
):
    contract_text = (
        contract if isinstance(contract, str) else json.dumps(contract)
    )
    return client.post(
        "/api/grid/mirror",
        files={"file": ("fixture", image_bytes, mime_type)},
        data={"contract": contract_text},
    )


def generated_contract(image_bytes: bytes) -> dict[str, object]:
    return make_contract(
        image_bytes,
        width=8,
        height=6,
        cell_size=2,
        x_boundaries=[2, 4, 6],
        y_boundaries=[1, 3, 5],
    )


def test_generated_image_matches_independent_numpy_reference(
    client: TestClient,
    generated_rgba_image: Image.Image,
    png_bytes,
) -> None:
    image_bytes = png_bytes(generated_rgba_image)
    contract = generated_contract(image_bytes)

    response = post_mirror(client, image_bytes, contract)

    assert response.status_code == 200
    assert response.headers["content-type"] == "image/png"
    assert response.headers["cache-control"] == "no-store"
    actual = decode_normalized_rgba(response.content)
    expected = numpy_reference_mirror(generated_rgba_image, contract)
    assert np.array_equal(np.asarray(actual), np.asarray(expected))


def test_mirror_twice_restores_every_rgba_pixel(
    client: TestClient,
    generated_rgba_image: Image.Image,
    png_bytes,
) -> None:
    original_bytes = png_bytes(generated_rgba_image)
    first_contract = generated_contract(original_bytes)
    first_response = post_mirror(client, original_bytes, first_contract)
    assert first_response.status_code == 200

    second_contract = copy.deepcopy(first_contract)
    second_contract["imageSha256"] = hashlib.sha256(
        first_response.content
    ).hexdigest()
    second_response = post_mirror(
        client, first_response.content, second_contract
    )

    assert second_response.status_code == 200
    restored = decode_normalized_rgba(second_response.content)
    assert np.array_equal(
        np.asarray(restored), np.asarray(generated_rgba_image)
    )


@pytest.mark.parametrize(
    ("mutation", "expected_code"),
    [
        ({"confirmed": False}, "GRID_NOT_CONFIRMED"),
        ({"cellSize": 2.0}, "GRID_CONTRACT_INVALID"),
        ({"xBoundaries": [2, 4]}, "GRID_BOUNDARY_COUNT_MISMATCH"),
        (
            {"xBoundaries": [2, 4, 4]},
            "GRID_BOUNDARIES_NOT_INCREASING",
        ),
        (
            {"xBoundaries": [1, 3, 6]},
            "GRID_BOUNDARIES_NOT_EQUALLY_SPACED",
        ),
        (
            {
                "cellSize": 4,
                "xBoundaries": [0, 2, 4],
                "yBoundaries": [0, 2, 4],
            },
            "GRID_HARMONIC_GUESS_REJECTED",
        ),
        (
            {"xBoundaries": [-1, 1, 3]},
            "GRID_BOUNDARIES_OUT_OF_BOUNDS",
        ),
        ({"naturalWidth": 9}, "GRID_IMAGE_STALE"),
        ({"xBoundaries": [2, 4.5, 6]}, "GRID_CONTRACT_INVALID"),
    ],
)
def test_malformed_or_mismatched_contracts_are_rejected(
    client: TestClient,
    generated_rgba_image: Image.Image,
    png_bytes,
    mutation: dict[str, object],
    expected_code: str,
) -> None:
    image_bytes = png_bytes(generated_rgba_image)
    contract = generated_contract(image_bytes)
    contract.update(mutation)

    response = post_mirror(client, image_bytes, contract)

    assert_structured_chinese_error(response, expected_code)


def test_malformed_json_is_rejected(
    client: TestClient,
    generated_rgba_image: Image.Image,
    png_bytes,
) -> None:
    image_bytes = png_bytes(generated_rgba_image)

    response = post_mirror(client, image_bytes, "{not-json")

    assert_structured_chinese_error(response, "GRID_CONTRACT_INVALID")


def test_hash_mismatch_is_rejected_as_stale(
    client: TestClient,
    generated_rgba_image: Image.Image,
    png_bytes,
) -> None:
    image_bytes = png_bytes(generated_rgba_image)
    contract = generated_contract(image_bytes)
    contract["imageSha256"] = "0" * 64

    response = post_mirror(client, image_bytes, contract)

    assert_structured_chinese_error(response, "GRID_IMAGE_HASH_MISMATCH")


def test_declared_mime_must_match_decoded_format(
    client: TestClient,
    generated_rgba_image: Image.Image,
    png_bytes,
) -> None:
    image_bytes = png_bytes(generated_rgba_image)
    contract = generated_contract(image_bytes)

    response = post_mirror(
        client, image_bytes, contract, mime_type="image/jpeg"
    )

    assert_structured_chinese_error(
        response, "IMAGE_MIME_MISMATCH", expected_status=415
    )


def test_unsupported_declared_mime_is_rejected_without_decoding(
    client: TestClient,
    generated_rgba_image: Image.Image,
    png_bytes,
) -> None:
    image_bytes = png_bytes(generated_rgba_image)
    contract = generated_contract(image_bytes)

    response = post_mirror(
        client,
        image_bytes,
        contract,
        mime_type="application/octet-stream",
    )

    assert_structured_chinese_error(
        response, "IMAGE_MIME_UNSUPPORTED", expected_status=415
    )


def test_undecodable_upload_is_rejected(
    client: TestClient,
) -> None:
    image_bytes = b"not-an-image"
    contract = make_contract(
        image_bytes,
        width=2,
        height=2,
        cell_size=1,
        x_boundaries=[0, 1, 2],
        y_boundaries=[0, 1, 2],
    )

    response = post_mirror(client, image_bytes, contract)

    assert_structured_chinese_error(response, "IMAGE_DECODE_FAILED")


def test_missing_multipart_fields_use_the_same_structured_error(
    client: TestClient,
) -> None:
    response = client.post("/api/grid/mirror")

    assert_structured_chinese_error(response, "REQUEST_INVALID")


def test_transparent_png_preserves_alpha_exactly(
    client: TestClient,
    generated_rgba_image: Image.Image,
    png_bytes,
) -> None:
    image_bytes = png_bytes(generated_rgba_image)
    contract = generated_contract(image_bytes)

    response = post_mirror(client, image_bytes, contract)

    actual = np.asarray(decode_normalized_rgba(response.content))
    expected = np.asarray(numpy_reference_mirror(generated_rgba_image, contract))
    assert response.status_code == 200
    assert np.array_equal(actual, expected)
    assert np.array_equal(
        np.sort(actual[:, :, 3].ravel()),
        np.sort(np.asarray(generated_rgba_image)[:, :, 3].ravel()),
    )


def test_exif_orientation_is_normalized_before_dimension_validation(
    client: TestClient,
) -> None:
    intended = Image.new("RGB", (6, 4))
    for y in range(4):
        for x in range(6):
            intended.putpixel(
                (x, y),
                ((x * 35) % 256, (y * 61) % 256, ((x + y) * 29) % 256),
            )
    stored = intended.transpose(Image.Transpose.ROTATE_90)
    exif = stored.getexif()
    exif[274] = 6
    encoded = io.BytesIO()
    stored.save(encoded, format="JPEG", quality=100, subsampling=0, exif=exif)
    image_bytes = encoded.getvalue()
    normalized = decode_normalized_rgba(image_bytes)
    assert normalized.size == (6, 4)
    contract = make_contract(
        image_bytes,
        width=6,
        height=4,
        cell_size=2,
        x_boundaries=[0, 2, 4, 6],
        y_boundaries=[0, 2, 4],
    )

    response = post_mirror(
        client, image_bytes, contract, mime_type="image/jpeg"
    )

    assert response.status_code == 200
    actual = decode_normalized_rgba(response.content)
    expected = numpy_reference_mirror(normalized, contract)
    assert np.array_equal(np.asarray(actual), np.asarray(expected))


def test_pre_orientation_dimensions_are_rejected_as_stale(
    client: TestClient,
) -> None:
    stored = Image.new("RGB", (4, 6), "red")
    exif = stored.getexif()
    exif[274] = 6
    encoded = io.BytesIO()
    stored.save(encoded, format="JPEG", exif=exif)
    image_bytes = encoded.getvalue()
    contract = make_contract(
        image_bytes,
        width=4,
        height=6,
        cell_size=2,
        x_boundaries=[0, 2, 4],
        y_boundaries=[0, 2, 4, 6],
    )

    response = post_mirror(
        client, image_bytes, contract, mime_type="image/jpeg"
    )

    assert_structured_chinese_error(response, "GRID_IMAGE_STALE")


def test_upload_byte_limit_is_enforced(
    client: TestClient,
    generated_rgba_image: Image.Image,
    png_bytes,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    image_bytes = png_bytes(generated_rgba_image)
    contract = generated_contract(image_bytes)
    monkeypatch.setattr(limits, "MAX_UPLOAD_BYTES", len(image_bytes) - 1)

    response = post_mirror(client, image_bytes, contract)

    assert_structured_chinese_error(
        response, "IMAGE_UPLOAD_TOO_LARGE", expected_status=413
    )


def test_vercel_multipart_request_limit_is_enforced(
    client: TestClient,
    generated_rgba_image: Image.Image,
    png_bytes,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    image_bytes = png_bytes(generated_rgba_image)
    contract = generated_contract(image_bytes)
    monkeypatch.setenv("VERCEL", "1")
    monkeypatch.setattr(limits, "VERCEL_MAX_MULTIPART_REQUEST_BYTES", 1)

    response = post_mirror(client, image_bytes, contract)

    assert_structured_chinese_error(
        response, "VERCEL_MULTIPART_REQUEST_TOO_LARGE", expected_status=413
    )


def test_vercel_png_response_limit_is_enforced(
    client: TestClient,
    generated_rgba_image: Image.Image,
    png_bytes,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    image_bytes = png_bytes(generated_rgba_image)
    contract = generated_contract(image_bytes)
    monkeypatch.setenv("VERCEL_ENV", "preview")
    monkeypatch.setattr(limits, "VERCEL_MAX_PNG_RESPONSE_BYTES", 1)

    response = post_mirror(client, image_bytes, contract)

    assert_structured_chinese_error(
        response, "VERCEL_PNG_RESPONSE_TOO_LARGE", expected_status=413
    )


def test_decoded_pixel_limit_is_enforced(
    client: TestClient,
    generated_rgba_image: Image.Image,
    png_bytes,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    image_bytes = png_bytes(generated_rgba_image)
    contract = generated_contract(image_bytes)
    monkeypatch.setattr(limits, "MAX_DECODED_PIXELS", 47)

    response = post_mirror(client, image_bytes, contract)

    assert_structured_chinese_error(
        response, "IMAGE_PIXEL_LIMIT_EXCEEDED", expected_status=413
    )


@pytest.mark.parametrize("valid_contract", [True, False])
def test_upload_file_is_always_closed(
    generated_rgba_image: Image.Image,
    png_bytes,
    valid_contract: bool,
) -> None:
    image_bytes = png_bytes(generated_rgba_image)
    contract = generated_contract(image_bytes)
    if not valid_contract:
        contract["confirmed"] = False
    upload = UploadFile(
        io.BytesIO(image_bytes),
        headers=Headers({"content-type": "image/png"}),
    )

    try:
        asyncio.run(create_mirror_png(upload, json.dumps(contract)))
    except Exception:
        if valid_contract:
            raise

    assert upload.file.closed
