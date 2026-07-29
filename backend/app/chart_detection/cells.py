from __future__ import annotations

import hashlib
import json
from collections import Counter

import cv2
import numpy as np

from app.chart_detection.types import CellRecord
from app.models import GridCellSummary


def extract_cell_records(
    rectified_rgba: np.ndarray,
    x_boundaries: tuple[int, ...] | list[int],
    y_boundaries: tuple[int, ...] | list[int],
) -> tuple[CellRecord, ...]:
    rgb = rectified_rgba[:, :, :3]
    alpha = rectified_rgba[:, :, 3]
    background = _dominant_background(rgb, alpha)
    provisional: list[
        tuple[int, int, bool, tuple[float, float, float] | None, float]
    ] = []

    for row, (top, bottom) in enumerate(
        zip(y_boundaries, y_boundaries[1:])
    ):
        for column, (left, right) in enumerate(
            zip(x_boundaries, x_boundaries[1:])
        ):
            margin_x = max(1, round((right - left) * 0.12))
            margin_y = max(1, round((bottom - top) * 0.12))
            patch_rgb = rgb[
                top + margin_y : max(top + margin_y + 1, bottom - margin_y),
                left + margin_x : max(left + margin_x + 1, right - margin_x),
            ]
            patch_alpha = alpha[
                top + margin_y : max(top + margin_y + 1, bottom - margin_y),
                left + margin_x : max(left + margin_x + 1, right - margin_x),
            ]
            if patch_rgb.size == 0:
                provisional.append((row, column, False, None, 0.0))
                continue

            distances = np.linalg.norm(
                patch_rgb.astype(np.float32) - background,
                axis=2,
            )
            foreground = (distances >= 20) & (patch_alpha >= 16)
            foreground_ratio = float(foreground.mean())
            gray = cv2.cvtColor(patch_rgb, cv2.COLOR_RGB2GRAY)
            texture = float(np.std(gray)) / 64
            occupancy_score = min(
                1.0, foreground_ratio / 0.12 * 0.8 + min(0.2, texture * 0.2)
            )
            occupied = foreground_ratio >= 0.055
            representative = (
                _representative_lab(patch_rgb, foreground)
                if occupied
                else None
            )
            confidence = (
                min(1.0, 0.55 + abs(foreground_ratio - 0.055) * 5)
                if occupied
                else min(1.0, 0.55 + (0.055 - foreground_ratio) * 8)
            )
            provisional.append(
                (
                    row,
                    column,
                    occupied,
                    representative,
                    max(confidence, occupancy_score),
                )
            )

    cluster_ids = _cluster_representatives(
        [item[3] for item in provisional]
    )
    return tuple(
        CellRecord(
            row=row,
            column=column,
            occupied=occupied,
            representative_lab=representative,
            color_cluster_id=cluster_id,
            confidence=confidence,
        )
        for (
            row,
            column,
            occupied,
            representative,
            confidence,
        ), cluster_id in zip(provisional, cluster_ids)
    )


def summarize_cells(records: tuple[CellRecord, ...]) -> GridCellSummary:
    occupied = [record for record in records if record.occupied]
    uncertain = [record for record in records if record.confidence < 0.68]
    clusters = {
        record.color_cluster_id
        for record in occupied
        if record.color_cluster_id is not None
    }
    digest_payload = [
        (
            record.row,
            record.column,
            record.occupied,
            tuple(
                round(value / 4) * 4
                for value in record.representative_lab
            )
            if record.representative_lab is not None
            else None,
        )
        for record in records
    ]
    digest = hashlib.sha256(
        json.dumps(
            digest_payload,
            ensure_ascii=True,
            separators=(",", ":"),
        ).encode("ascii")
    ).hexdigest()
    return GridCellSummary(
        totalCellCount=len(records),
        occupiedCellCount=len(occupied),
        colorClusterCount=len(clusters),
        uncertainCellCount=len(uncertain),
        matrixDigest=digest,
    )


def _dominant_background(
    rgb: np.ndarray, alpha: np.ndarray
) -> np.ndarray:
    opaque = rgb[alpha >= 16]
    if opaque.size == 0:
        return np.asarray((255, 255, 255), dtype=np.float32)
    quantized = (opaque // 8).astype(np.uint8)
    packed = (
        quantized[:, 0].astype(np.uint32) << 10
        | quantized[:, 1].astype(np.uint32) << 5
        | quantized[:, 2].astype(np.uint32)
    )
    dominant = Counter(packed.tolist()).most_common(1)[0][0]
    mask = packed == dominant
    return np.median(opaque[mask], axis=0).astype(np.float32)


def _representative_lab(
    patch_rgb: np.ndarray, foreground: np.ndarray
) -> tuple[float, float, float]:
    saturation = cv2.cvtColor(patch_rgb, cv2.COLOR_RGB2HSV)[:, :, 1]
    chromatic_foreground = foreground & (saturation >= 28)
    pixels = patch_rgb[chromatic_foreground]
    if len(pixels) < 3:
        pixels = patch_rgb[foreground]
    if len(pixels) < 3:
        pixels = patch_rgb.reshape(-1, 3)
    median_rgb = np.median(pixels, axis=0).astype(np.float32) / 255
    lab = cv2.cvtColor(
        median_rgb.reshape(1, 1, 3),
        cv2.COLOR_RGB2LAB,
    )[0, 0]
    return (float(lab[0]), float(lab[1]), float(lab[2]))


def _cluster_representatives(
    values: list[tuple[float, float, float] | None],
) -> tuple[int | None, ...]:
    keys = [
        (
            round(value[0] / 8),
            round(value[1] / 10),
            round(value[2] / 10),
        )
        if value is not None
        else None
        for value in values
    ]
    ordered_keys = sorted({key for key in keys if key is not None})
    mapping = {key: index for index, key in enumerate(ordered_keys)}
    return tuple(mapping.get(key) if key is not None else None for key in keys)
