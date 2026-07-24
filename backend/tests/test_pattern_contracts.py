from __future__ import annotations

from copy import deepcopy

import numpy as np
import pytest
from PIL import Image
from pydantic import ValidationError

from app.generated_palettes import PALETTE_COLORS, PALETTE_SOURCE_VERSION
from app.models import BeadProject, PatternGenerationSettings
from app.pattern import _sample_image


def color_id(palette_id: str, *, offset: int = 0) -> str:
    colors = [
        color["id"]
        for color in PALETTE_COLORS
        if color["paletteId"] == palette_id
    ]
    return colors[offset]


def project_payload() -> dict[str, object]:
    selected_color = color_id("default")
    return {
        "schemaVersion": "1.0",
        "id": "project-contract-test",
        "createdAt": "2026-07-24T00:00:00+00:00",
        "updatedAt": "2026-07-24T00:00:00+00:00",
        "mode": "photo",
        "source": {
            "fileName": "contract.png",
            "mimeType": "image/png",
            "naturalWidth": 1,
            "naturalHeight": 1,
            "sha256": "0" * 64,
            "crop": {"x": 0, "y": 0, "width": 1, "height": 1},
            "rotation": 0,
        },
        "grid": {
            "rows": 1,
            "columns": 1,
            "aspectLocked": True,
            "beadDiameterMm": 5.0,
            "beadPitchMm": 5.0,
            "boardPresetId": "standardSquare",
            "boardRows": 29,
            "boardColumns": 29,
        },
        "palette": {
            "paletteId": "default",
            "paletteVersion": PALETTE_SOURCE_VERSION,
            "availableColorIds": [selected_color],
            "maximumColors": 1,
        },
        "generation": {
            "sampling": "nearest",
            "colorDistance": "ciede2000",
            "dithering": "none",
            "alphaEmptyThreshold": 0.1,
        },
        "cells": [[{"kind": "bead", "colorId": selected_color}]],
        "revision": 4,
    }


def generation_payload() -> dict[str, object]:
    selected_color = color_id("default")
    return {
        "mode": "photo",
        "crop": {"x": 0, "y": 0, "width": 1, "height": 1},
        "rotation": 0,
        "rows": 1,
        "columns": 1,
        "aspectLocked": True,
        "beadDiameterMm": 5.0,
        "beadPitchMm": 5.0,
        "boardPresetId": "custom",
        "boardRows": 12,
        "boardColumns": 10,
        "paletteId": "default",
        "availableColorIds": [selected_color],
        "maximumColors": 1,
        "sampling": "nearest",
        "dithering": "none",
        "alphaEmptyThreshold": 0.1,
    }


@pytest.mark.parametrize(
    ("mutate", "error_match"),
    [
        (
            lambda payload: payload["palette"].update(
                {
                    "paletteId": "default",
                    "availableColorIds": [color_id("mard")],
                }
            ),
            "selected palette",
        ),
        (
            lambda payload: payload["palette"].update(
                {
                    "availableColorIds": [
                        color_id("default"),
                        color_id("default"),
                    ]
                }
            ),
            "unique",
        ),
        (
            lambda payload: payload["palette"].update(
                {"availableColorIds": [color_id("default")], "maximumColors": 2}
            ),
            "maximum colors",
        ),
        (
            lambda payload: payload.update(
                {
                    "cells": [
                        [
                            {
                                "kind": "bead",
                                "colorId": color_id("default", offset=1),
                            }
                        ]
                    ]
                }
            ),
            "available colors",
        ),
    ],
)
def test_project_rejects_invalid_palette_and_cell_contracts(
    mutate,
    error_match: str,
) -> None:
    payload = project_payload()
    mutate(payload)

    with pytest.raises(ValidationError, match=error_match):
        BeadProject.model_validate(payload)


def test_custom_board_dimensions_are_preserved() -> None:
    settings = PatternGenerationSettings.model_validate(generation_payload())

    assert settings.board_rows == 12
    assert settings.board_columns == 10


@pytest.mark.parametrize(
    ("preset", "board_rows", "board_columns"),
    [
        ("smallSquare", 14, 29),
        ("standardSquare", 14, 29),
    ],
)
def test_fixed_board_presets_reject_mismatched_dimensions(
    preset: str,
    board_rows: int,
    board_columns: int,
) -> None:
    payload = generation_payload()
    payload.update(
        {
            "boardPresetId": preset,
            "boardRows": board_rows,
            "boardColumns": board_columns,
        }
    )

    with pytest.raises(ValidationError, match="board dimensions"):
        PatternGenerationSettings.model_validate(payload)


@pytest.mark.parametrize("sampling", ["nearest", "average"])
def test_fully_transparent_pixels_stay_empty_at_zero_threshold(
    sampling: str,
) -> None:
    image = Image.new("RGBA", (1, 1), (120, 80, 40, 0))

    _, occupied = _sample_image(
        image,
        rows=1,
        columns=1,
        sampling=sampling,
        alpha_empty_threshold=0.0,
    )

    np.testing.assert_array_equal(occupied, np.asarray([False]))


def test_project_grid_rejects_invalid_custom_board_boundaries() -> None:
    payload = project_payload()
    invalid = deepcopy(payload)
    invalid["grid"].update(
        {
            "boardPresetId": "custom",
            "boardRows": 0,
            "boardColumns": 301,
        }
    )

    with pytest.raises(ValidationError):
        BeadProject.model_validate(invalid)
