from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pytest
from fastapi.testclient import TestClient

from conftest import (
    decode_normalized_rgba,
    make_contract,
    numpy_reference_mirror,
)
from test_mirror_api import post_mirror

OWNER_SAMPLE = Path(__file__).parent / "fixtures" / "owner-grid.jpg"
LEFT, TOP, RIGHT, BOTTOM = 40, 101, 1400, 1181
CELL_SIZE, COLUMNS, ROWS = 40, 34, 27


@pytest.fixture
def owner_sample_bytes() -> bytes:
    if not OWNER_SAMPLE.is_file():
        pytest.skip("未提供未跟踪的所有者真实样本")
    return OWNER_SAMPLE.read_bytes()


def owner_contract(image_bytes: bytes) -> dict[str, object]:
    return make_contract(
        image_bytes,
        width=1440,
        height=1526,
        cell_size=CELL_SIZE,
        x_boundaries=list(range(LEFT, RIGHT + 1, CELL_SIZE)),
        y_boundaries=list(range(TOP, BOTTOM + 1, CELL_SIZE)),
    )


def test_owner_sample_contract_is_the_known_34_by_27_grid(
    owner_sample_bytes: bytes,
) -> None:
    contract = owner_contract(owner_sample_bytes)

    assert contract["xBoundaries"][0] == LEFT
    assert contract["xBoundaries"][-1] == RIGHT
    assert contract["yBoundaries"][0] == TOP
    assert contract["yBoundaries"][-1] == BOTTOM
    assert contract["cellSize"] == CELL_SIZE
    assert contract["columns"] == COLUMNS
    assert contract["rows"] == ROWS
    assert (RIGHT - LEFT, BOTTOM - TOP) == (
        COLUMNS * CELL_SIZE,
        ROWS * CELL_SIZE,
    )


def test_owner_sample_has_zero_reference_and_outside_grid_differences_and_all_cells(
    client: TestClient,
    owner_sample_bytes: bytes,
) -> None:
    source = decode_normalized_rgba(owner_sample_bytes)
    assert source.size == (1440, 1526)
    contract = owner_contract(owner_sample_bytes)

    response = post_mirror(
        client,
        owner_sample_bytes,
        json.loads(json.dumps(contract)),
        mime_type="image/jpeg",
    )

    assert response.status_code == 200
    actual = np.asarray(decode_normalized_rgba(response.content))
    source_pixels = np.asarray(source)
    expected = np.asarray(numpy_reference_mirror(source, contract))
    assert np.count_nonzero(actual != expected) == 0

    outside_mask = np.ones(source_pixels.shape[:2], dtype=bool)
    outside_mask[TOP:BOTTOM, LEFT:RIGHT] = False
    assert np.count_nonzero(actual[outside_mask] != source_pixels[outside_mask]) == 0

    correct_cells = 0
    for row in range(ROWS):
        top = TOP + row * CELL_SIZE
        bottom = top + CELL_SIZE
        for source_column in range(COLUMNS):
            source_left = LEFT + source_column * CELL_SIZE
            source_right = source_left + CELL_SIZE
            target_column = COLUMNS - 1 - source_column
            target_left = LEFT + target_column * CELL_SIZE
            target_right = target_left + CELL_SIZE
            if np.array_equal(
                actual[top:bottom, target_left:target_right],
                source_pixels[top:bottom, source_left:source_right],
            ):
                correct_cells += 1

    assert correct_cells == COLUMNS * ROWS == 918
