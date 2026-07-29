from __future__ import annotations

import hashlib
import io
import json
from typing import Any

import cv2
import numpy as np
import pytest
from fastapi.testclient import TestClient
from PIL import Image, ImageDraw


RING_COLUMNS = 12
RING_ROWS = 9
RING_PITCH_X = 24
RING_PITCH_Y = 20
RING_LEFT = 36
RING_TOP = 44
RING_MISSING_CELLS = {(1, 2), (4, 7), (7, 3)}


def _encode_png(image: Image.Image) -> bytes:
    output = io.BytesIO()
    image.save(output, format="PNG")
    return output.getvalue()


def _post_detection(
    client: TestClient,
    image_bytes: bytes,
    *,
    mode: str,
    quad: list[dict[str, int]] | None = None,
    expected_columns: int | None = None,
    expected_rows: int | None = None,
):
    data: dict[str, str] = {"mode": mode}
    if quad is not None:
        data["quad"] = json.dumps(quad)
    if expected_columns is not None:
        data["expectedColumns"] = str(expected_columns)
    if expected_rows is not None:
        data["expectedRows"] = str(expected_rows)
    return client.post(
        "/api/grid/detect",
        files={"file": ("chart.png", image_bytes, "image/png")},
        data=data,
    )


def _v2_detection_payload(response: Any) -> dict[str, Any]:
    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload.get("contractVersion") == "2.0", payload
    assert set(payload) == {
        "contractVersion",
        "imageSha256",
        "naturalWidth",
        "naturalHeight",
        "selectedCandidateId",
        "candidates",
    }
    return payload


def _selected_candidate(payload: dict[str, Any]) -> dict[str, Any]:
    selected_id = payload["selectedCandidateId"]
    selected = [
        candidate
        for candidate in payload["candidates"]
        if candidate["candidateId"] == selected_id
    ]
    assert len(selected) == 1
    return selected[0]


def _assert_canonical_boundaries(
    candidate: dict[str, Any],
    *,
    columns: int,
    rows: int,
) -> None:
    x_boundaries = candidate["xBoundaries"]
    y_boundaries = candidate["yBoundaries"]

    assert len(x_boundaries) == columns + 1
    assert len(y_boundaries) == rows + 1
    assert x_boundaries[0] == 0
    assert y_boundaries[0] == 0
    assert x_boundaries[-1] == candidate["rectifiedWidth"]
    assert y_boundaries[-1] == candidate["rectifiedHeight"]
    assert all(left < right for left, right in zip(x_boundaries, x_boundaries[1:]))
    assert all(top < bottom for top, bottom in zip(y_boundaries, y_boundaries[1:]))


def _ring_chart(*, with_macro_guides: bool) -> tuple[Image.Image, int]:
    image = Image.new("RGBA", (440, 290), (248, 246, 240, 255))
    draw = ImageDraw.Draw(image)
    right = RING_LEFT + RING_COLUMNS * RING_PITCH_X
    bottom = RING_TOP + RING_ROWS * RING_PITCH_Y

    draw.text((RING_LEFT, 12), "12 x 9 bead chart", fill=(30, 34, 40, 255))

    if with_macro_guides:
        for column in range(0, RING_COLUMNS + 1, 3):
            x = RING_LEFT + column * RING_PITCH_X
            draw.line((x, RING_TOP, x, bottom), fill=(90, 98, 108, 255), width=2)
        for row in range(0, RING_ROWS + 1, 3):
            y = RING_TOP + row * RING_PITCH_Y
            draw.line((RING_LEFT, y, right, y), fill=(90, 98, 108, 255), width=2)

    palette = (
        (218, 71, 82, 255),
        (47, 139, 104, 255),
        (65, 105, 190, 255),
        (226, 165, 53, 255),
    )
    occupied = 0
    for row in range(RING_ROWS):
        for column in range(RING_COLUMNS):
            if (row, column) in RING_MISSING_CELLS:
                continue
            occupied += 1
            center_x = RING_LEFT + column * RING_PITCH_X + RING_PITCH_X // 2
            center_y = RING_TOP + row * RING_PITCH_Y + RING_PITCH_Y // 2
            fill = palette[(row * 3 + column) % len(palette)]
            draw.ellipse(
                (center_x - 7, center_y - 7, center_x + 7, center_y + 7),
                fill=fill,
                outline=(30, 34, 40, 255),
                width=2,
            )
            draw.ellipse(
                (center_x - 2, center_y - 2, center_x + 2, center_y + 2),
                fill=(248, 246, 240, 255),
            )
            draw.line(
                (center_x - 5, center_y - 4, center_x - 2, center_y - 4),
                fill=(20, 22, 26, 255),
                width=1,
            )

    # A deliberately non-lattice legend must not become part of the main grid.
    draw.rectangle((354, 58, 428, 190), fill=(255, 255, 255, 255))
    draw.rectangle((354, 58, 428, 190), outline=(70, 74, 80, 255), width=1)
    draw.text((362, 66), "Legend", fill=(30, 34, 40, 255))
    for index, fill in enumerate(palette):
        y = 92 + index * 22
        draw.ellipse((362, y, 374, y + 12), fill=fill, outline=(30, 34, 40, 255))
        draw.text((382, y), str(index + 1), fill=(30, 34, 40, 255))

    return image, occupied


def _projective_line_chart() -> tuple[Image.Image, list[dict[str, int]]]:
    columns = 13
    rows = 8
    pitch_x = 22
    pitch_y = 24
    rectified_width = columns * pitch_x
    rectified_height = rows * pitch_y
    canonical = np.full(
        (rectified_height + 1, rectified_width + 1, 4),
        255,
        dtype=np.uint8,
    )

    for row in range(rows):
        for column in range(columns):
            top = row * pitch_y
            left = column * pitch_x
            canonical[top + 1 : top + pitch_y, left + 1 : left + pitch_x] = (
                (45 + row * 21) % 220,
                (70 + column * 17) % 220,
                (130 + row * 9 + column * 5) % 220,
                255,
            )
            canonical[top + 4 : top + 7, left + 3 : left + 8] = (20, 24, 28, 255)

    for column in range(columns + 1):
        x = column * pitch_x
        canonical[:, max(0, x - 1) : min(rectified_width + 1, x + 1)] = (
            25,
            28,
            32,
            255,
        )
    for row in range(rows + 1):
        y = row * pitch_y
        canonical[max(0, y - 1) : min(rectified_height + 1, y + 1), :] = (
            25,
            28,
            32,
            255,
        )

    quad = [
        {"x": 58, "y": 36},
        {"x": 374, "y": 62},
        {"x": 346, "y": 276},
        {"x": 34, "y": 244},
    ]
    source_points = np.float32(
        [
            [0, 0],
            [rectified_width, 0],
            [rectified_width, rectified_height],
            [0, rectified_height],
        ]
    )
    destination_points = np.float32(
        [[point["x"], point["y"]] for point in quad]
    )
    transform = cv2.getPerspectiveTransform(source_points, destination_points)
    warped = cv2.warpPerspective(
        canonical,
        transform,
        (420, 310),
        flags=cv2.INTER_NEAREST,
        borderMode=cv2.BORDER_CONSTANT,
        borderValue=(246, 244, 238, 255),
    )
    image = Image.fromarray(warped, mode="RGBA")
    draw = ImageDraw.Draw(image)
    draw.text((12, 10), "projective chart", fill=(20, 24, 28, 255))
    draw.text((360, 288), "outside", fill=(20, 24, 28, 255))
    return image, quad


def _filled_cell_chart() -> Image.Image:
    columns = 10
    rows = 7
    pitch_x = 28
    pitch_y = 24
    left = 30
    top = 42
    image = Image.new("RGBA", (430, 260), (250, 248, 244, 255))
    draw = ImageDraw.Draw(image)
    palette = (
        (220, 55, 75, 255),
        (35, 155, 105, 255),
        (55, 95, 210, 255),
        (230, 160, 40, 255),
    )
    for row in range(rows):
        for column in range(columns):
            x = left + column * pitch_x
            y = top + row * pitch_y
            draw.rectangle(
                (x + 2, y + 2, x + pitch_x - 3, y + pitch_y - 3),
                fill=palette[(row + column) % len(palette)],
            )
            draw.line(
                (x + 5, y + 5, x + 10, y + 5),
                fill=(15, 15, 15, 255),
            )

    draw.rectangle(
        (335, 55, 415, 210),
        fill=(255, 255, 255, 255),
        outline=(50, 50, 50, 255),
    )
    draw.text((344, 64), "Legend", fill=(20, 20, 20, 255))
    for index, color in enumerate(palette):
        y = 84 + index * 28
        draw.rectangle((345, y, 366, y + 18), fill=color)
        draw.text((377, y + 2), str(index + 1), fill=(20, 20, 20, 255))
    return image


def _borderless_equal_luminance_chart() -> Image.Image:
    columns = 10
    rows = 8
    pitch_x = 24
    pitch_y = 20
    left = 30
    top = 35
    pixels = np.full(
        (240, 340, 4),
        (245, 245, 245, 255),
        dtype=np.uint8,
    )
    colors = (
        (200, 40, 40, 255),
        (40, 122, 40, 255),
    )
    for row in range(rows):
        for column in range(columns):
            pixels[
                top + row * pitch_y : top + (row + 1) * pitch_y,
                left + column * pitch_x : left + (column + 1) * pitch_x,
            ] = colors[(row + column) % 2]
    return Image.fromarray(pixels, mode="RGBA")


def _numbered_axis_chart() -> tuple[
    Image.Image,
    tuple[int, int, int, int],
]:
    columns = 23
    rows = 22
    pitch = 58
    left = pitch
    top = pitch * 2
    right = left + columns * pitch
    bottom = top + rows * pitch
    image = Image.new(
        "RGBA",
        ((columns + 2) * pitch, bottom + pitch * 4),
        (250, 250, 249, 255),
    )
    draw = ImageDraw.Draw(image)

    for row in range(rows):
        for column in range(columns):
            cell_left = left + column * pitch
            cell_top = top + row * pitch
            background = (
                (240, 239, 237, 255)
                if (row + column) % 2 == 0
                else (247, 246, 244, 255)
            )
            draw.rectangle(
                (
                    cell_left,
                    cell_top,
                    cell_left + pitch - 1,
                    cell_top + pitch - 1,
                ),
                fill=background,
            )
            if 2 <= row <= 20 and abs(column - 11) <= (
                min(row - 1, 21 - row) + 2
            ):
                palette = (
                    (164, 137, 151, 255),
                    (222, 146, 145, 255),
                    (232, 232, 229, 255),
                    (75, 75, 76, 255),
                )
                draw.rectangle(
                    (
                        cell_left + 2,
                        cell_top + 2,
                        cell_left + pitch - 3,
                        cell_top + pitch - 3,
                    ),
                    fill=palette[(row + column) % len(palette)],
                )
                draw.rectangle(
                    (
                        cell_left + 18,
                        cell_top + 25,
                        cell_left + 40,
                        cell_top + 31,
                    ),
                    fill=(35, 35, 35, 255),
                )

    # Opposing numbered-axis bands surround the grid. Dark marks stand in
    # for arbitrary glyphs; detection must use their structure, not OCR.
    for column in range(columns):
        cell_left = left + column * pitch
        for band_top in (top - pitch, bottom):
            draw.rectangle(
                (
                    cell_left,
                    band_top,
                    cell_left + pitch - 1,
                    band_top + pitch - 1,
                ),
                fill=(238, 246, 251, 255),
            )
            draw.rectangle(
                (
                    cell_left + 22,
                    band_top + 16,
                    cell_left + 34,
                    band_top + 40,
                ),
                fill=(25, 25, 25, 255),
            )
    for row in range(rows):
        cell_top = top + row * pitch
        for band_left in (0, right):
            draw.rectangle(
                (
                    band_left,
                    cell_top,
                    band_left + pitch - 1,
                    cell_top + pitch - 1,
                ),
                fill=(238, 246, 251, 255),
            )
            draw.rectangle(
                (
                    band_left + 22,
                    cell_top + 16,
                    band_left + 34,
                    cell_top + 40,
                ),
                fill=(25, 25, 25, 255),
            )

    # The fundamental lines are faint while alternate lines are stronger,
    # reproducing the harmonic ambiguity in downloaded chart images.
    for column in range(columns + 1):
        x = left + column * pitch
        draw.line(
            (x, top, x, bottom),
            fill=(
                (155, 155, 155, 255)
                if column in (0, columns)
                else (
                    (204, 202, 198, 255)
                    if column % 2
                    else (180, 177, 172, 255)
                )
            ),
            width=2 if column in (0, columns) else 1,
        )
    for row in range(rows + 1):
        y = top + row * pitch
        draw.line(
            (left, y, right, y),
            fill=(
                (155, 155, 155, 255)
                if row in (0, rows)
                else (
                    (204, 202, 198, 255)
                    if row % 2
                    else (180, 177, 172, 255)
                )
            ),
            width=2 if row in (0, rows) else 1,
        )

    return image, (left, top, right, bottom)


def _axis_aligned_semantic_chart() -> tuple[
    Image.Image,
    list[dict[str, int]],
    tuple[int, int, int, int],
]:
    width, height = 180, 140
    pixels = np.zeros((height, width, 4), dtype=np.uint8)
    for y in range(height):
        for x in range(width):
            pixels[y, x] = (
                (x * 7 + y * 3) % 256,
                (x * 5 + y * 11) % 256,
                (x * 13 + y * 2) % 256,
                255,
            )

    left, top = 28, 32
    pitch_x, pitch_y = 24, 20
    columns, rows = 4, 3
    right = left + columns * pitch_x
    bottom = top + rows * pitch_y
    for row in range(rows):
        for column in range(columns):
            cell_left = left + column * pitch_x
            cell_top = top + row * pitch_y
            pixels[
                cell_top : cell_top + pitch_y,
                cell_left : cell_left + pitch_x,
            ] = (
                35 + row * 65,
                45 + column * 45,
                90 + row * 25 + column * 8,
                255,
            )
            pixels[
                cell_top + 2 : cell_top + 5,
                cell_left + 3 : cell_left + 9,
            ] = (248, 12 + row, 20 + column, 255)
            pixels[
                cell_top + pitch_y - 5 : cell_top + pitch_y - 2,
                cell_left + 2 : cell_left + 5,
            ] = (14 + column, 238, 28 + row, 255)

    quad = [
        {"x": left, "y": top},
        {"x": right, "y": top},
        {"x": right, "y": bottom},
        {"x": left, "y": bottom},
    ]
    return Image.fromarray(pixels, mode="RGBA"), quad, (left, top, right, bottom)


def _mirror_contract_from_candidate(
    payload: dict[str, Any],
    candidate: dict[str, Any],
    *,
    axis: str,
) -> dict[str, Any]:
    return {
        "contractVersion": "2.0",
        "imageSha256": payload["imageSha256"],
        "naturalWidth": payload["naturalWidth"],
        "naturalHeight": payload["naturalHeight"],
        "candidateId": candidate["candidateId"],
        "sourceQuad": candidate["sourceQuad"],
        "rectifiedWidth": candidate["rectifiedWidth"],
        "rectifiedHeight": candidate["rectifiedHeight"],
        "pitchX": candidate["pitchX"],
        "pitchY": candidate["pitchY"],
        "columns": candidate["columns"],
        "rows": candidate["rows"],
        "xBoundaries": candidate["xBoundaries"],
        "yBoundaries": candidate["yBoundaries"],
        "matrixDigest": candidate["cellSummary"]["matrixDigest"],
        "confirmed": True,
        "axis": axis,
    }


def test_v2_detection_returns_ranked_distinct_candidates(
    client: TestClient,
) -> None:
    image, _occupied = _ring_chart(with_macro_guides=True)

    response = _post_detection(
        client,
        _encode_png(image),
        mode="auto",
    )

    payload = _v2_detection_payload(response)
    candidates = payload["candidates"]
    assert 2 <= len(candidates) <= 3
    assert payload["selectedCandidateId"] == candidates[0]["candidateId"]
    assert len({candidate["candidateId"] for candidate in candidates}) == len(
        candidates
    )
    assert (candidates[0]["columns"], candidates[0]["rows"]) == (
        RING_COLUMNS,
        RING_ROWS,
    )
    assert any(
        (candidate["columns"], candidate["rows"])
        != (RING_COLUMNS, RING_ROWS)
        for candidate in candidates[1:]
    )


def test_v2_detects_unequal_pitch_ring_lattice_with_exact_dimensions(
    client: TestClient,
) -> None:
    image, occupied = _ring_chart(with_macro_guides=False)

    response = _post_detection(
        client,
        _encode_png(image),
        mode="auto",
    )

    payload = _v2_detection_payload(response)
    candidate = _selected_candidate(payload)
    assert candidate["detector"] == "component"
    assert candidate["style"] == "ring-grid"
    assert candidate["mirrorFrame"] == "occupied-bounds"
    assert (candidate["columns"], candidate["rows"]) == (
        RING_COLUMNS,
        RING_ROWS,
    )
    assert candidate["pitchX"] == pytest.approx(RING_PITCH_X, abs=1.0)
    assert candidate["pitchY"] == pytest.approx(RING_PITCH_Y, abs=1.0)
    assert candidate["pitchX"] != pytest.approx(candidate["pitchY"])
    assert candidate["review"] == "review"
    assert "GRID_BOUNDARY_UNCERTAIN" in candidate["warnings"]
    assert candidate["cellSummary"]["totalCellCount"] == (
        RING_COLUMNS * RING_ROWS
    )
    assert candidate["cellSummary"]["occupiedCellCount"] == occupied
    assert len(candidate["cellSummary"]["matrixDigest"]) == 64
    _assert_canonical_boundaries(
        candidate,
        columns=RING_COLUMNS,
        rows=RING_ROWS,
    )


def test_v2_manual_quad_and_dimensions_recover_projective_grid(
    client: TestClient,
) -> None:
    image, quad = _projective_line_chart()

    response = _post_detection(
        client,
        _encode_png(image),
        mode="manual",
        quad=quad,
        expected_columns=13,
        expected_rows=8,
    )

    payload = _v2_detection_payload(response)
    candidate = _selected_candidate(payload)
    assert candidate["detector"] == "manual"
    assert candidate["mirrorFrame"] == "manual-region"
    assert (candidate["columns"], candidate["rows"]) == (13, 8)
    assert candidate["review"] == "review"
    for actual, expected in zip(candidate["sourceQuad"], quad):
        assert actual["x"] == pytest.approx(expected["x"], abs=1.0)
        assert actual["y"] == pytest.approx(expected["y"], abs=1.0)
    _assert_canonical_boundaries(candidate, columns=13, rows=8)


def test_v2_detects_separated_filled_cells_without_absorbing_legend(
    client: TestClient,
) -> None:
    response = _post_detection(
        client,
        _encode_png(_filled_cell_chart()),
        mode="auto",
    )

    payload = _v2_detection_payload(response)
    candidate = _selected_candidate(payload)
    assert candidate["detector"] == "component"
    assert candidate["style"] == "filled-cell-grid"
    assert (candidate["columns"], candidate["rows"]) == (10, 7)
    assert candidate["pitchX"] == pytest.approx(28, abs=1)
    assert candidate["pitchY"] == pytest.approx(24, abs=1)
    assert candidate["cellSummary"]["occupiedCellCount"] == 70


def test_v2_auto_rectifies_a_clear_projective_grid(
    client: TestClient,
) -> None:
    image, expected_quad = _projective_line_chart()
    response = _post_detection(
        client,
        _encode_png(image),
        mode="auto",
    )

    payload = _v2_detection_payload(response)
    candidate = _selected_candidate(payload)
    assert candidate["detector"] == "rectified"
    assert (candidate["columns"], candidate["rows"]) == (13, 8)
    assert candidate["review"] == "review"
    assert "GRID_PERSPECTIVE_REVIEW_REQUIRED" in candidate["warnings"]
    for actual, expected in zip(candidate["sourceQuad"], expected_quad):
        assert actual["x"] == pytest.approx(expected["x"], abs=4)
        assert actual["y"] == pytest.approx(expected["y"], abs=4)


def test_v2_uses_rgb_edges_for_borderless_equal_luminance_cells(
    client: TestClient,
) -> None:
    image = _borderless_equal_luminance_chart()
    gray = cv2.cvtColor(
        np.asarray(image.convert("RGB")),
        cv2.COLOR_RGB2GRAY,
    )
    assert gray[45, 40] == gray[45, 64]

    response = _post_detection(
        client,
        _encode_png(image),
        mode="auto",
    )

    payload = _v2_detection_payload(response)
    candidate = _selected_candidate(payload)
    assert (candidate["columns"], candidate["rows"]) == (10, 8)
    assert candidate["pitchX"] == pytest.approx(24, abs=1)
    assert candidate["pitchY"] == pytest.approx(20, abs=1)


def test_v2_prefers_fundamental_grid_inside_opposing_numbered_axes(
    client: TestClient,
) -> None:
    image, expected_bounds = _numbered_axis_chart()

    response = _post_detection(
        client,
        _encode_png(image),
        mode="auto",
    )

    payload = _v2_detection_payload(response)
    candidate = _selected_candidate(payload)
    assert (candidate["columns"], candidate["rows"]) == (23, 22)
    assert candidate["pitchX"] == pytest.approx(58, abs=1)
    assert candidate["pitchY"] == pytest.approx(58, abs=1)
    expected_left, expected_top, expected_right, expected_bottom = (
        expected_bounds
    )
    actual_quad = candidate["sourceQuad"]
    assert actual_quad[0] == pytest.approx(
        {"x": expected_left, "y": expected_top},
        abs=2,
    )
    assert actual_quad[1] == pytest.approx(
        {"x": expected_right, "y": expected_top},
        abs=2,
    )
    assert actual_quad[2] == pytest.approx(
        {"x": expected_right, "y": expected_bottom},
        abs=2,
    )
    assert actual_quad[3] == pytest.approx(
        {"x": expected_left, "y": expected_bottom},
        abs=2,
    )


def test_v2_manual_axis_aligned_grid_preserves_non_divisible_extent(
    client: TestClient,
) -> None:
    image = Image.new("RGBA", (1440, 1500), (248, 248, 248, 255))
    quad = [
        {"x": 57, "y": 130},
        {"x": 1382, "y": 130},
        {"x": 1382, "y": 1398},
        {"x": 57, "y": 1398},
    ]

    response = _post_detection(
        client,
        _encode_png(image),
        mode="manual",
        quad=quad,
        expected_columns=23,
        expected_rows=22,
    )

    payload = _v2_detection_payload(response)
    candidate = _selected_candidate(payload)
    assert candidate["rectifiedWidth"] == 1325
    assert candidate["rectifiedHeight"] == 1268
    assert candidate["pitchX"] == pytest.approx(1325 / 23)
    assert candidate["pitchY"] == pytest.approx(1268 / 22)
    assert "GRID_PERSPECTIVE_REVIEW_REQUIRED" not in candidate["warnings"]


def test_v2_mirror_moves_complete_cells_and_preserves_outside_pixels(
    client: TestClient,
) -> None:
    image, quad, bounds = _axis_aligned_semantic_chart()
    image_bytes = _encode_png(image)
    detection_response = _post_detection(
        client,
        image_bytes,
        mode="manual",
        quad=quad,
        expected_columns=4,
        expected_rows=3,
    )
    payload = _v2_detection_payload(detection_response)
    candidate = _selected_candidate(payload)
    contract = _mirror_contract_from_candidate(
        payload,
        candidate,
        axis="horizontal",
    )

    mirror_response = client.post(
        "/api/grid/mirror",
        files={"file": ("chart.png", image_bytes, "image/png")},
        data={"contract": json.dumps(contract)},
    )

    assert mirror_response.status_code == 200, mirror_response.text
    assert mirror_response.headers["content-type"] == "image/png"
    with Image.open(io.BytesIO(mirror_response.content)) as decoded:
        actual = np.asarray(decoded.convert("RGBA"))
    source = np.asarray(image)
    left, top, right, bottom = bounds
    outside = np.ones(source.shape[:2], dtype=bool)
    outside[top:bottom, left:right] = False
    assert np.array_equal(actual[outside], source[outside])

    for row in range(3):
        for source_column in range(4):
            source_top = top + row * 20
            source_left = left + source_column * 24
            target_left = left + (3 - source_column) * 24
            source_cell = source[
                source_top : source_top + 20,
                source_left : source_left + 24,
            ]
            target_cell = actual[
                source_top : source_top + 20,
                target_left : target_left + 24,
            ]
            assert np.array_equal(target_cell, source_cell)

    assert hashlib.sha256(image_bytes).hexdigest() == payload["imageSha256"]


def test_v2_projective_mirror_preserves_safe_pixels_outside_quad(
    client: TestClient,
) -> None:
    image, quad = _projective_line_chart()
    image_bytes = _encode_png(image)
    detection = _post_detection(
        client,
        image_bytes,
        mode="manual",
        quad=quad,
        expected_columns=13,
        expected_rows=8,
    )
    payload = _v2_detection_payload(detection)
    candidate = _selected_candidate(payload)
    contract = _mirror_contract_from_candidate(
        payload,
        candidate,
        axis="horizontal",
    )

    response = client.post(
        "/api/grid/mirror",
        files={"file": ("chart.png", image_bytes, "image/png")},
        data={"contract": json.dumps(contract)},
    )

    assert response.status_code == 200, response.text
    with Image.open(io.BytesIO(response.content)) as decoded:
        actual = np.asarray(decoded.convert("RGBA"))
    source = np.asarray(image)
    quad_mask = np.zeros(source.shape[:2], dtype=np.uint8)
    cv2.fillConvexPoly(
        quad_mask,
        np.asarray(
            [[point["x"], point["y"]] for point in quad],
            dtype=np.int32,
        ),
        255,
    )
    safe_outside = (
        cv2.dilate(
            quad_mask,
            np.ones((5, 5), dtype=np.uint8),
            iterations=1,
        )
        == 0
    )
    assert np.array_equal(actual[safe_outside], source[safe_outside])
    assert not np.array_equal(actual[quad_mask > 0], source[quad_mask > 0])


@pytest.mark.parametrize(
    ("mutation", "expected_code"),
    [
        ({"candidateId": "manual-00000000000000000000000000000000"}, "GRID_CANDIDATE_AUTHORITY_INVALID"),
        ({"matrixDigest": "0" * 64}, "GRID_CELL_MATRIX_MISMATCH"),
        ({"displayOnly": True}, "GRID_CONTRACT_INVALID"),
    ],
)
def test_v2_mirror_rejects_tampered_authority_fields(
    client: TestClient,
    mutation: dict[str, Any],
    expected_code: str,
) -> None:
    image, quad, _bounds = _axis_aligned_semantic_chart()
    image_bytes = _encode_png(image)
    detection = _post_detection(
        client,
        image_bytes,
        mode="manual",
        quad=quad,
        expected_columns=4,
        expected_rows=3,
    )
    payload = _v2_detection_payload(detection)
    contract = _mirror_contract_from_candidate(
        payload,
        _selected_candidate(payload),
        axis="horizontal",
    )
    contract.update(mutation)

    response = client.post(
        "/api/grid/mirror",
        files={"file": ("chart.png", image_bytes, "image/png")},
        data={"contract": json.dumps(contract)},
    )

    assert response.status_code == 422
    assert response.json()["error"]["code"] == expected_code
