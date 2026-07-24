from __future__ import annotations

import hashlib
import json
import math
from datetime import UTC, datetime
from typing import Any

import numpy as np
from fastapi import UploadFile
from PIL import Image
from pydantic import ValidationError

from app.errors import ApiError
from app.generated_palettes import PALETTE_COLORS, PALETTE_SOURCE_VERSION
from app.models import (
    BeadProject,
    PatternGenerationResponse,
    PatternGenerationSettings,
    ProjectStatistics,
)
from app.service import decode_normalized_rgba, read_upload

MAX_SETTINGS_BYTES = 64 * 1024
COLOR_BY_ID = {color["id"]: color for color in PALETTE_COLORS}


def _reject_nonstandard_json_constant(value: str) -> None:
    raise ValueError(value)


def parse_generation_settings(
    settings_text: str,
) -> PatternGenerationSettings:
    try:
        encoded_size = len(settings_text.encode("utf-8"))
    except UnicodeEncodeError as error:
        raise ApiError(
            422,
            "PATTERN_SETTINGS_INVALID",
            "生成设置不是有效的 UTF-8 JSON。",
        ) from error
    if encoded_size > MAX_SETTINGS_BYTES:
        raise ApiError(
            413,
            "PATTERN_SETTINGS_TOO_LARGE",
            "生成设置超过允许的大小。",
        )
    try:
        payload: Any = json.loads(
            settings_text, parse_constant=_reject_nonstandard_json_constant
        )
        return PatternGenerationSettings.model_validate(payload)
    except (json.JSONDecodeError, ValueError, ValidationError) as error:
        raise ApiError(
            422,
            "PATTERN_SETTINGS_INVALID",
            "生成设置缺失、类型错误，或包含当前色板没有的颜色。",
        ) from error


async def create_pattern_project(
    upload: UploadFile, settings_text: str
) -> PatternGenerationResponse:
    try:
        settings = parse_generation_settings(settings_text)
        image_bytes = await read_upload(upload)
        source = decode_normalized_rgba(
            image_bytes, upload.content_type or ""
        )
        normalized = _rotate_clockwise(source, settings.rotation)
        crop = settings.crop
        if (
            crop.x + crop.width > normalized.width
            or crop.y + crop.height > normalized.height
        ):
            raise ApiError(
                422,
                "PATTERN_CROP_OUT_OF_BOUNDS",
                "裁剪区域超出图片范围，请重新调整。",
            )
        cropped = normalized.crop(
            (
                crop.x,
                crop.y,
                crop.x + crop.width,
                crop.y + crop.height,
            )
        )
        cells = generate_cells(cropped, settings)
        statistics = calculate_statistics(cells)
        timestamp = datetime.now(UTC).isoformat()
        source_hash = hashlib.sha256(image_bytes).hexdigest()
        project_hash = hashlib.sha256(
            image_bytes + settings_text.encode("utf-8")
        ).hexdigest()[:20]
        safe_file_name = _safe_source_name(upload.filename)
        project = BeadProject.model_validate(
            {
                "schemaVersion": "1.0",
                "id": f"project-{project_hash}",
                "createdAt": timestamp,
                "updatedAt": timestamp,
                "mode": settings.mode,
                "source": {
                    "fileName": safe_file_name,
                    "mimeType": upload.content_type,
                    "naturalWidth": source.width,
                    "naturalHeight": source.height,
                    "sha256": source_hash,
                    "crop": crop.model_dump(),
                    "rotation": settings.rotation,
                },
                "grid": {
                    "rows": settings.rows,
                    "columns": settings.columns,
                    "aspectLocked": settings.aspect_locked,
                    "beadDiameterMm": settings.bead_diameter_mm,
                    "beadPitchMm": settings.bead_pitch_mm,
                    "boardPresetId": settings.board_preset_id,
                },
                "palette": {
                    "paletteId": settings.palette_id,
                    "paletteVersion": PALETTE_SOURCE_VERSION,
                    "availableColorIds": settings.available_color_ids,
                    "maximumColors": settings.maximum_colors,
                },
                "generation": {
                    "sampling": settings.sampling,
                    "colorDistance": "ciede2000",
                    "dithering": settings.dithering,
                    "alphaEmptyThreshold": (
                        settings.alpha_empty_threshold
                    ),
                },
                "cells": cells,
                "revision": 0,
            }
        )
        return PatternGenerationResponse(
            project=project,
            statistics=statistics,
        )
    finally:
        await upload.close()


def generate_cells(
    source: Image.Image, settings: PatternGenerationSettings
) -> list[list[dict[str, str]]]:
    samples_linear, occupied = _sample_image(
        source,
        rows=settings.rows,
        columns=settings.columns,
        sampling=settings.sampling,
        alpha_empty_threshold=settings.alpha_empty_threshold,
    )
    palette = sorted(
        (COLOR_BY_ID[color_id] for color_id in settings.available_color_ids),
        key=lambda color: color["id"],
    )
    palette_linear = np.asarray(
        [_hex_to_linear(color["displayHex"]) for color in palette],
        dtype=np.float64,
    )
    palette_lab = _linear_rgb_to_lab(palette_linear)
    assignments, errors = _match_all(
        samples_linear, occupied, palette_lab
    )

    if (
        settings.maximum_colors is not None
        and settings.maximum_colors < len(palette)
    ):
        ranked_indices = _rank_used_colors(
            assignments,
            errors,
            occupied,
            len(palette),
            palette,
        )
        selected_indices = ranked_indices[: settings.maximum_colors]
        palette = [palette[index] for index in selected_indices]
        palette_linear = palette_linear[selected_indices]
        palette_lab = palette_lab[selected_indices]
        assignments, _ = _match_all(
            samples_linear, occupied, palette_lab
        )

    if settings.dithering == "floydSteinberg":
        assignments = _dither(
            samples_linear,
            occupied,
            palette_linear,
            palette_lab,
            settings.rows,
            settings.columns,
        )

    cells: list[list[dict[str, str]]] = []
    for row in range(settings.rows):
        cell_row: list[dict[str, str]] = []
        for column in range(settings.columns):
            index = row * settings.columns + column
            if not occupied[index]:
                cell_row.append({"kind": "empty"})
            else:
                color_index = int(assignments[index])
                cell_row.append(
                    {
                        "kind": "bead",
                        "colorId": palette[color_index]["id"],
                    }
                )
        cells.append(cell_row)
    return cells


def calculate_statistics(
    cells: list[list[dict[str, str]]],
) -> ProjectStatistics:
    counts: dict[str, int] = {}
    blank_count = 0
    for row in cells:
        for cell in row:
            if cell["kind"] == "empty":
                blank_count += 1
            else:
                color_id = cell["colorId"]
                counts[color_id] = counts.get(color_id, 0) + 1
    total = sum(len(row) for row in cells)
    non_empty = sum(counts.values())
    return ProjectStatistics.model_validate(
        {
            "totalCellCount": total,
            "blankCount": blank_count,
            "nonEmptyBeadCount": non_empty,
            "usedColorCount": len(counts),
            "perColorCounts": dict(sorted(counts.items())),
        }
    )


def _sample_image(
    source: Image.Image,
    *,
    rows: int,
    columns: int,
    sampling: str,
    alpha_empty_threshold: float,
) -> tuple[np.ndarray, np.ndarray]:
    rgba = np.asarray(source.convert("RGBA"), dtype=np.float64)
    alpha = rgba[:, :, 3] / 255.0
    linear = _srgb_to_linear(rgba[:, :, :3] / 255.0)

    if sampling == "nearest":
        row_indices = np.asarray(
            [
                min(
                    source.height - 1,
                    max(
                        0,
                        math.ceil((row + 0.5) * source.height / rows)
                        - 1,
                    ),
                )
                for row in range(rows)
            ]
        )
        column_indices = np.asarray(
            [
                min(
                    source.width - 1,
                    max(
                        0,
                        math.ceil(
                            (column + 0.5) * source.width / columns
                        )
                        - 1,
                    ),
                )
                for column in range(columns)
            ]
        )
        sampled_linear = linear[row_indices[:, None], column_indices[None, :]]
        sampled_alpha = alpha[
            row_indices[:, None], column_indices[None, :]
        ]
    else:
        sampled_alpha = _resize_float_channel(alpha, columns, rows)
        sampled_channels = []
        for channel in range(3):
            premultiplied = linear[:, :, channel] * alpha
            averaged = _resize_float_channel(
                premultiplied, columns, rows
            )
            sampled_channels.append(
                np.divide(
                    averaged,
                    sampled_alpha,
                    out=np.zeros_like(averaged),
                    where=sampled_alpha > 0,
                )
            )
        sampled_linear = np.stack(sampled_channels, axis=2)

    occupied = sampled_alpha.reshape(-1) >= alpha_empty_threshold
    return sampled_linear.reshape(-1, 3), occupied


def _resize_float_channel(
    channel: np.ndarray, width: int, height: int
) -> np.ndarray:
    image = Image.fromarray(channel.astype(np.float32), mode="F")
    return np.asarray(
        image.resize((width, height), Image.Resampling.BOX),
        dtype=np.float64,
    )


def _match_all(
    samples_linear: np.ndarray,
    occupied: np.ndarray,
    palette_lab: np.ndarray,
) -> tuple[np.ndarray, np.ndarray]:
    assignments = np.zeros(samples_linear.shape[0], dtype=np.int32)
    errors = np.zeros(samples_linear.shape[0], dtype=np.float64)
    sample_lab = _linear_rgb_to_lab(np.clip(samples_linear, 0, 1))
    for index in np.flatnonzero(occupied):
        distances = _ciede2000(sample_lab[index], palette_lab)
        assignment = int(np.argmin(distances))
        assignments[index] = assignment
        errors[index] = distances[assignment]
    return assignments, errors


def _rank_used_colors(
    assignments: np.ndarray,
    errors: np.ndarray,
    occupied: np.ndarray,
    palette_size: int,
    palette: list[dict[str, Any]],
) -> list[int]:
    counts = np.bincount(
        assignments[occupied], minlength=palette_size
    ).astype(int)
    error_sums = np.bincount(
        assignments[occupied],
        weights=errors[occupied],
        minlength=palette_size,
    )
    return sorted(
        range(palette_size),
        key=lambda index: (
            -counts[index],
            error_sums[index],
            palette[index]["id"],
        ),
    )


def _dither(
    samples_linear: np.ndarray,
    occupied: np.ndarray,
    palette_linear: np.ndarray,
    palette_lab: np.ndarray,
    rows: int,
    columns: int,
) -> np.ndarray:
    working = samples_linear.reshape(rows, columns, 3).copy()
    occupied_grid = occupied.reshape(rows, columns)
    assignments = np.zeros((rows, columns), dtype=np.int32)
    neighbors = (
        (0, 1, 7 / 16),
        (1, -1, 3 / 16),
        (1, 0, 5 / 16),
        (1, 1, 1 / 16),
    )
    for row in range(rows):
        for column in range(columns):
            if not occupied_grid[row, column]:
                continue
            current = np.clip(working[row, column], 0, 1)
            current_lab = _linear_rgb_to_lab(current[None, :])[0]
            distances = _ciede2000(current_lab, palette_lab)
            selected = int(np.argmin(distances))
            assignments[row, column] = selected
            error = current - palette_linear[selected]
            for row_delta, column_delta, weight in neighbors:
                target_row = row + row_delta
                target_column = column + column_delta
                if (
                    0 <= target_row < rows
                    and 0 <= target_column < columns
                    and occupied_grid[target_row, target_column]
                ):
                    working[target_row, target_column] += error * weight
    return assignments.reshape(-1)


def _hex_to_linear(display_hex: str) -> np.ndarray:
    srgb = np.asarray(
        [int(display_hex[index : index + 2], 16) for index in (1, 3, 5)],
        dtype=np.float64,
    )
    return _srgb_to_linear(srgb / 255.0)


def _srgb_to_linear(value: np.ndarray) -> np.ndarray:
    return np.where(
        value <= 0.04045,
        value / 12.92,
        ((value + 0.055) / 1.055) ** 2.4,
    )


def _linear_rgb_to_lab(linear: np.ndarray) -> np.ndarray:
    matrix = np.asarray(
        [
            [0.4124564, 0.3575761, 0.1804375],
            [0.2126729, 0.7151522, 0.0721750],
            [0.0193339, 0.1191920, 0.9503041],
        ]
    )
    xyz = linear @ matrix.T
    white = np.asarray([0.95047, 1.0, 1.08883])
    normalized = xyz / white
    delta = 6 / 29
    f = np.where(
        normalized > delta**3,
        np.cbrt(normalized),
        normalized / (3 * delta**2) + 4 / 29,
    )
    return np.column_stack(
        (
            116 * f[:, 1] - 16,
            500 * (f[:, 0] - f[:, 1]),
            200 * (f[:, 1] - f[:, 2]),
        )
    )


def _ciede2000(reference: np.ndarray, palette: np.ndarray) -> np.ndarray:
    l1, a1, b1 = reference
    l2 = palette[:, 0]
    a2 = palette[:, 1]
    b2 = palette[:, 2]
    c1 = math.hypot(a1, b1)
    c2 = np.hypot(a2, b2)
    c_bar = (c1 + c2) / 2
    g = 0.5 * (
        1
        - np.sqrt((c_bar**7) / (c_bar**7 + 25**7))
    )
    a1_prime = (1 + g) * a1
    a2_prime = (1 + g) * a2
    c1_prime = np.hypot(a1_prime, b1)
    c2_prime = np.hypot(a2_prime, b2)
    h1_prime = np.degrees(np.arctan2(b1, a1_prime)) % 360
    h1_prime = np.where(c1_prime == 0, 0, h1_prime)
    h2_prime = np.degrees(np.arctan2(b2, a2_prime)) % 360
    h2_prime = np.where(c2_prime == 0, 0, h2_prime)

    delta_l = l2 - l1
    delta_c = c2_prime - c1_prime
    delta_h_angle = h2_prime - h1_prime
    delta_h_angle = np.where(
        c1_prime * c2_prime == 0,
        0,
        np.where(
            np.abs(delta_h_angle) <= 180,
            delta_h_angle,
            np.where(
                delta_h_angle > 180,
                delta_h_angle - 360,
                delta_h_angle + 360,
            ),
        ),
    )
    delta_h = (
        2
        * np.sqrt(c1_prime * c2_prime)
        * np.sin(np.radians(delta_h_angle / 2))
    )
    l_bar = (l1 + l2) / 2
    c_bar_prime = (c1_prime + c2_prime) / 2
    h_sum = h1_prime + h2_prime
    h_bar = np.where(
        c1_prime * c2_prime == 0,
        h_sum,
        np.where(
            np.abs(h1_prime - h2_prime) <= 180,
            h_sum / 2,
            np.where(h_sum < 360, (h_sum + 360) / 2, (h_sum - 360) / 2),
        ),
    )
    t = (
        1
        - 0.17 * np.cos(np.radians(h_bar - 30))
        + 0.24 * np.cos(np.radians(2 * h_bar))
        + 0.32 * np.cos(np.radians(3 * h_bar + 6))
        - 0.20 * np.cos(np.radians(4 * h_bar - 63))
    )
    delta_theta = 30 * np.exp(-(((h_bar - 275) / 25) ** 2))
    r_c = 2 * np.sqrt(
        (c_bar_prime**7) / (c_bar_prime**7 + 25**7)
    )
    s_l = 1 + (
        0.015 * (l_bar - 50) ** 2
    ) / np.sqrt(20 + (l_bar - 50) ** 2)
    s_c = 1 + 0.045 * c_bar_prime
    s_h = 1 + 0.015 * c_bar_prime * t
    r_t = -np.sin(np.radians(2 * delta_theta)) * r_c
    return np.sqrt(
        (delta_l / s_l) ** 2
        + (delta_c / s_c) ** 2
        + (delta_h / s_h) ** 2
        + r_t * (delta_c / s_c) * (delta_h / s_h)
    )


def _rotate_clockwise(
    source: Image.Image, rotation: int
) -> Image.Image:
    if rotation == 90:
        return source.transpose(Image.Transpose.ROTATE_270)
    if rotation == 180:
        return source.transpose(Image.Transpose.ROTATE_180)
    if rotation == 270:
        return source.transpose(Image.Transpose.ROTATE_90)
    return source.copy()


def _safe_source_name(file_name: str | None) -> str:
    if not file_name:
        return "image"
    cleaned = "".join(
        "-" if ord(character) < 32 or character in '<>:"/\\|?*' else character
        for character in file_name
    ).strip()
    return cleaned[:255] or "image"
