from __future__ import annotations

import math
from collections import Counter

import cv2
import numpy as np

from app.chart_detection.geometry import (
    canonical_boundaries,
    rectangle_quad,
)
from app.chart_detection.types import (
    ComponentObservation,
    EvidenceMetrics,
    LatticeCandidate,
)


def detect_component_candidates(
    rgb: np.ndarray,
) -> tuple[LatticeCandidate, ...]:
    observations = extract_component_observations(rgb)
    if len(observations) < 6:
        return ()

    fitted = _fit_observation_lattice(observations, rgb.shape[1], rgb.shape[0])
    if fitted is None:
        return ()

    candidates = [fitted]
    harmonic = _harmonic_candidate(fitted, divisor=2)
    if harmonic is not None:
        candidates.append(harmonic)
    return tuple(candidates)


def extract_component_observations(
    rgb: np.ndarray,
) -> tuple[ComponentObservation, ...]:
    height, width = rgb.shape[:2]
    hsv = cv2.cvtColor(rgb, cv2.COLOR_RGB2HSV)
    saturation = hsv[:, :, 1]
    color_masks = [
        np.where(saturation >= threshold, 255, 0).astype(np.uint8)
        for threshold in (24, 44, 72)
    ]

    raw: list[ComponentObservation] = []
    maximum_width = max(12, round(width * 0.14))
    maximum_height = max(12, round(height * 0.14))
    for mask in color_masks:
        count, _labels, stats, centroids = cv2.connectedComponentsWithStats(
            mask,
            connectivity=8,
        )
        for index in range(1, count):
            x, y, component_width, component_height, pixel_area = stats[index]
            if (
                component_width < 5
                or component_height < 5
                or component_width > maximum_width
                or component_height > maximum_height
            ):
                continue
            aspect = component_width / component_height
            if aspect < 0.45 or aspect > 2.2:
                continue
            box_area = component_width * component_height
            fill_ratio = float(pixel_area) / box_area
            if pixel_area < 8 or fill_ratio < 0.08:
                continue
            raw.append(
                ComponentObservation(
                    x=float(centroids[index][0]),
                    y=float(centroids[index][1]),
                    width=float(component_width),
                    height=float(component_height),
                    area=float(pixel_area),
                    circularity=min(1.0, fill_ratio),
                    ring_score=max(
                        0.0, min(1.0, (0.9 - fill_ratio) / 0.25)
                    ),
                )
            )

    if len(raw) < 6:
        gray = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)
        edges = cv2.Canny(gray, 45, 140)
        edges = cv2.morphologyEx(
            edges,
            cv2.MORPH_CLOSE,
            cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3)),
        )
        contours, hierarchy = cv2.findContours(
            edges,
            cv2.RETR_CCOMP,
            cv2.CHAIN_APPROX_SIMPLE,
        )
        hierarchy_rows = hierarchy[0] if hierarchy is not None else None
        for index, contour in enumerate(contours):
            x, y, component_width, component_height = cv2.boundingRect(contour)
            if (
                component_width < 5
                or component_height < 5
                or component_width > maximum_width
                or component_height > maximum_height
            ):
                continue
            aspect = component_width / component_height
            if aspect < 0.45 or aspect > 2.2:
                continue
            area = float(abs(cv2.contourArea(contour)))
            box_area = component_width * component_height
            if area < 8 or area / box_area < 0.08:
                continue
            perimeter = float(cv2.arcLength(contour, True))
            circularity = (
                min(1.0, 4 * math.pi * area / (perimeter * perimeter))
                if perimeter > 0
                else 0.0
            )
            child = (
                int(hierarchy_rows[index][2])
                if hierarchy_rows is not None
                else -1
            )
            ring_score = 1.0 if child >= 0 else min(1.0, circularity)
            raw.append(
                ComponentObservation(
                    x=x + component_width / 2,
                    y=y + component_height / 2,
                    width=float(component_width),
                    height=float(component_height),
                    area=area,
                    circularity=circularity,
                    ring_score=ring_score,
                )
            )

    if not raw:
        return ()

    families: Counter[tuple[int, int]] = Counter(
        (
            max(1, round(observation.width / 3)),
            max(1, round(observation.height / 3)),
        )
        for observation in raw
        if observation.width >= 7 and observation.height >= 7
    )
    if not families:
        return ()
    family, _count = families.most_common(1)[0]
    family_width = family[0] * 3
    family_height = family[1] * 3
    selected = [
        observation
        for observation in raw
        if abs(observation.width - family_width)
        <= max(3, family_width * 0.35)
        and abs(observation.height - family_height)
        <= max(3, family_height * 0.35)
    ]
    selected.sort(key=lambda observation: (-observation.area, observation.y, observation.x))

    deduplicated: list[ComponentObservation] = []
    duplicate_radius = max(2.0, min(family_width, family_height) * 0.28)
    for observation in selected:
        if any(
            math.dist(
                (observation.x, observation.y),
                (existing.x, existing.y),
            )
            <= duplicate_radius
            for existing in deduplicated
        ):
            continue
        deduplicated.append(observation)
    return tuple(deduplicated)


def _fit_observation_lattice(
    observations: tuple[ComponentObservation, ...],
    image_width: int,
    image_height: int,
) -> LatticeCandidate | None:
    median_width = float(np.median([item.width for item in observations]))
    median_height = float(np.median([item.height for item in observations]))
    pitch_x = _nearest_axis_pitch(
        observations,
        primary="x",
        cross_tolerance=max(2.5, median_height * 0.42),
        minimum=max(3.0, median_width * 1.08),
    )
    pitch_y = _nearest_axis_pitch(
        observations,
        primary="y",
        cross_tolerance=max(2.5, median_width * 0.42),
        minimum=max(3.0, median_height * 1.08),
    )
    if pitch_x is None or pitch_y is None:
        return None

    phase_x, residual_x = _best_phase(
        [item.x for item in observations], pitch_x
    )
    phase_y, residual_y = _best_phase(
        [item.y for item in observations], pitch_y
    )
    tolerance_x = max(2.0, pitch_x * 0.16)
    tolerance_y = max(2.0, pitch_y * 0.16)
    assigned: list[tuple[int, int, ComponentObservation, float]] = []
    for observation in observations:
        column = round((observation.x - phase_x) / pitch_x)
        row = round((observation.y - phase_y) / pitch_y)
        expected_x = phase_x + column * pitch_x
        expected_y = phase_y + row * pitch_y
        residual = math.hypot(
            (observation.x - expected_x) / pitch_x,
            (observation.y - expected_y) / pitch_y,
        )
        if (
            abs(observation.x - expected_x) <= tolerance_x
            and abs(observation.y - expected_y) <= tolerance_y
        ):
            assigned.append((column, row, observation, residual))
    if len(assigned) < 6:
        return None

    by_column = Counter(item[0] for item in assigned)
    by_row = Counter(item[1] for item in assigned)
    column_threshold = max(2, math.ceil(max(by_column.values()) * 0.34))
    row_threshold = max(2, math.ceil(max(by_row.values()) * 0.34))
    column_run = _best_consecutive_run(
        index
        for index, count in by_column.items()
        if count >= column_threshold
    )
    row_run = _best_consecutive_run(
        index for index, count in by_row.items() if count >= row_threshold
    )
    if len(column_run) < 2 or len(row_run) < 2:
        return None

    coherent = [
        item
        for item in assigned
        if item[0] in column_run and item[1] in row_run
    ]
    unique_cells = {(item[0], item[1]) for item in coherent}
    columns = len(column_run)
    rows = len(row_run)
    if len(unique_cells) < max(6, round(columns * rows * 0.28)):
        return None

    integer_pitch_x = max(3, round(pitch_x))
    integer_pitch_y = max(3, round(pitch_y))
    left = round(
        phase_x + min(column_run) * pitch_x - integer_pitch_x / 2
    )
    top = round(
        phase_y + min(row_run) * pitch_y - integer_pitch_y / 2
    )
    right = left + columns * integer_pitch_x
    bottom = top + rows * integer_pitch_y
    if left < 0:
        right -= left
        left = 0
    if top < 0:
        bottom -= top
        top = 0
    if right > image_width:
        left -= right - image_width
        right = image_width
    if bottom > image_height:
        top -= bottom - image_height
        bottom = image_height
    if left < 0 or top < 0:
        return None

    inlier_ratio = len(coherent) / len(observations)
    coverage = len(unique_cells) / (columns * rows)
    normalized_residual = float(
        np.median([item[3] for item in coherent])
    )
    ring_score = float(
        np.median([item[2].ring_score for item in coherent])
    )
    style = "ring-grid" if ring_score >= 0.55 else "filled-cell-grid"
    periodicity = max(
        0.0,
        min(
            1.0,
            1 - (residual_x / pitch_x + residual_y / pitch_y) / 2,
        ),
    )
    metrics = EvidenceMetrics(
        line_coverage=0.0,
        lattice_inlier_ratio=min(1.0, inlier_ratio),
        normalized_residual=min(1.0, normalized_residual),
        periodicity_score=periodicity,
        harmonic_margin=min(1.0, 0.35 + coverage * 0.55),
        boundary_support=min(1.0, coverage * 0.72),
        cell_consistency=min(1.0, coverage),
        hypothesis_agreement=min(1.0, 0.4 + inlier_ratio * 0.5),
    )
    confidence = min(
        0.96,
        0.28
        + metrics.lattice_inlier_ratio * 0.24
        + metrics.periodicity_score * 0.2
        + metrics.cell_consistency * 0.18,
    )
    return LatticeCandidate(
        detector="component",
        style=style,
        mirror_frame="occupied-bounds",
        source_quad=rectangle_quad(left, top, right, bottom),
        rectified_width=columns * integer_pitch_x,
        rectified_height=rows * integer_pitch_y,
        pitch_x=float(integer_pitch_x),
        pitch_y=float(integer_pitch_y),
        columns=columns,
        rows=rows,
        x_boundaries=canonical_boundaries(
            columns * integer_pitch_x, columns
        ),
        y_boundaries=canonical_boundaries(rows * integer_pitch_y, rows),
        confidence=confidence,
        review="review",
        metrics=metrics,
        warnings=("GRID_BOUNDARY_UNCERTAIN",),
        score=confidence + coverage * 0.25 - normalized_residual * 0.2,
    )


def _nearest_axis_pitch(
    observations: tuple[ComponentObservation, ...],
    *,
    primary: str,
    cross_tolerance: float,
    minimum: float,
) -> float | None:
    differences: list[float] = []
    for observation in observations:
        nearest = math.inf
        for other in observations:
            if observation is other:
                continue
            cross_difference = (
                abs(observation.y - other.y)
                if primary == "x"
                else abs(observation.x - other.x)
            )
            primary_difference = (
                abs(observation.x - other.x)
                if primary == "x"
                else abs(observation.y - other.y)
            )
            if (
                cross_difference <= cross_tolerance
                and primary_difference >= minimum
            ):
                nearest = min(nearest, primary_difference)
        if math.isfinite(nearest):
            differences.append(nearest)
    if len(differences) < 4:
        return None
    median = float(np.median(differences))
    inliers = [
        value
        for value in differences
        if abs(value - median) <= max(2.0, median * 0.18)
    ]
    if len(inliers) < 3:
        return None
    return float(np.median(inliers))


def _best_phase(values: list[float], pitch: float) -> tuple[float, float]:
    best_phase = values[0] % pitch
    best_residuals: list[float] = []
    best_key = (-1, math.inf)
    for value in values:
        phase = value % pitch
        residuals = [
            min((item - phase) % pitch, (phase - item) % pitch)
            for item in values
        ]
        tolerance = max(2.0, pitch * 0.16)
        inliers = [residual for residual in residuals if residual <= tolerance]
        key = (len(inliers), -float(np.median(inliers)) if inliers else -math.inf)
        if key > best_key:
            best_key = key
            best_phase = phase
            best_residuals = inliers
    return best_phase, float(np.median(best_residuals or [pitch]))


def _best_consecutive_run(indices: object) -> tuple[int, ...]:
    ordered = sorted(set(indices))
    if not ordered:
        return ()
    runs: list[list[int]] = [[ordered[0]]]
    for value in ordered[1:]:
        if value == runs[-1][-1] + 1:
            runs[-1].append(value)
        else:
            runs.append([value])
    return tuple(max(runs, key=lambda run: (len(run), -run[0])))


def _harmonic_candidate(
    candidate: LatticeCandidate,
    *,
    divisor: int,
) -> LatticeCandidate | None:
    if candidate.columns < divisor * 2 or candidate.rows < divisor * 2:
        return None
    columns = candidate.columns // divisor
    rows = candidate.rows // divisor
    if columns < 2 or rows < 2:
        return None
    width = columns * round(candidate.pitch_x * divisor)
    height = rows * round(candidate.pitch_y * divisor)
    left, top = candidate.source_quad[0]
    quad = rectangle_quad(left, top, left + width, top + height)
    metrics = EvidenceMetrics(
        line_coverage=candidate.metrics.line_coverage,
        lattice_inlier_ratio=candidate.metrics.lattice_inlier_ratio * 0.65,
        normalized_residual=min(
            1.0, candidate.metrics.normalized_residual + 0.15
        ),
        periodicity_score=candidate.metrics.periodicity_score * 0.7,
        harmonic_margin=max(0.0, candidate.metrics.harmonic_margin - 0.3),
        boundary_support=candidate.metrics.boundary_support * 0.7,
        cell_consistency=candidate.metrics.cell_consistency * 0.8,
        hypothesis_agreement=candidate.metrics.hypothesis_agreement * 0.6,
    )
    return LatticeCandidate(
        detector="periodic",
        style=candidate.style,
        mirror_frame="occupied-bounds",
        source_quad=quad,
        rectified_width=width,
        rectified_height=height,
        pitch_x=width / columns,
        pitch_y=height / rows,
        columns=columns,
        rows=rows,
        x_boundaries=canonical_boundaries(width, columns),
        y_boundaries=canonical_boundaries(height, rows),
        confidence=max(0.2, candidate.confidence - 0.28),
        review="review",
        metrics=metrics,
        warnings=("GRID_HARMONIC_AMBIGUOUS", "GRID_BOUNDARY_UNCERTAIN"),
        score=candidate.score - 0.45,
    )
