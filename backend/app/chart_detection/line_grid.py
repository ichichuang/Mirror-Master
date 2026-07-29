from __future__ import annotations

import math

import cv2
import numpy as np
from PIL import Image

from app.chart_detection.geometry import canonical_boundaries, rectangle_quad
from app.chart_detection.periodicity import period_candidates
from app.chart_detection.types import EvidenceMetrics, LatticeCandidate
from app.errors import ApiError


def detect_line_candidates(
    source: Image.Image,
    image_sha256: str,
) -> tuple[LatticeCandidate, ...]:
    candidates: list[LatticeCandidate] = []
    legacy = _legacy_line_candidate(source, image_sha256)
    if legacy is not None:
        candidates.append(legacy)
    projection = _projection_line_candidate(np.asarray(source.convert("RGB")))
    if projection is not None and all(
        projection.geometry_key != candidate.geometry_key
        for candidate in candidates
    ):
        candidates.append(projection)
    return tuple(candidates)


def _legacy_line_candidate(
    source: Image.Image,
    image_sha256: str,
) -> LatticeCandidate | None:
    from app.detection import detect_legacy_grid

    try:
        response = detect_legacy_grid(
            source,
            image_sha256,
            "auto",
            None,
        )
    except ApiError:
        return None

    left, top, right, bottom = _refine_legacy_bounds(
        np.asarray(source.convert("RGB")),
        left=response.left,
        top=response.top,
        right=response.right,
        bottom=response.bottom,
        cell_size=response.cell_size,
        columns=response.columns,
        rows=response.rows,
    )
    width = right - left
    height = bottom - top
    review = response.warning is not None or response.confidence < 0.72
    coverage = max(0.0, min(1.0, response.confidence))
    metrics = EvidenceMetrics(
        line_coverage=coverage,
        lattice_inlier_ratio=coverage,
        normalized_residual=max(0.0, min(1.0, 1 - coverage)),
        periodicity_score=coverage,
        harmonic_margin=max(0.0, min(1.0, coverage - 0.15)),
        boundary_support=coverage,
        cell_consistency=coverage,
        hypothesis_agreement=coverage,
    )
    return LatticeCandidate(
        detector="line",
        style="line-grid",
        mirror_frame="explicit-grid",
        source_quad=rectangle_quad(
            left, top, right, bottom
        ),
        rectified_width=width,
        rectified_height=height,
        pitch_x=width / response.columns,
        pitch_y=height / response.rows,
        columns=response.columns,
        rows=response.rows,
        x_boundaries=canonical_boundaries(width, response.columns),
        y_boundaries=canonical_boundaries(height, response.rows),
        confidence=response.confidence,
        review="review" if review else "ready",
        metrics=metrics,
        warnings=("GRID_LOW_CONFIDENCE",) if review else (),
        score=response.confidence + metrics.boundary_support * 0.35,
    )


def _refine_legacy_bounds(
    rgb: np.ndarray,
    *,
    left: int,
    top: int,
    right: int,
    bottom: int,
    cell_size: int,
    columns: int,
    rows: int,
) -> tuple[int, int, int, int]:
    from app.detection import _extract_line_evidence, _full_span_support

    gray = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)
    x_evidence, y_evidence = _extract_line_evidence(
        gray,
        include_hough=True,
    )
    radius = max(2, min(16, round(cell_size * 0.22)))

    refined_top = _best_outer_boundary(
        y_evidence,
        top,
        radius,
        cross_start=left,
        cross_end=right,
        axis="y",
        full_span_support=_full_span_support,
    )
    refined_bottom = _best_outer_boundary(
        y_evidence,
        bottom,
        radius,
        cross_start=left,
        cross_end=right,
        axis="y",
        full_span_support=_full_span_support,
    )
    refined_left = _best_outer_boundary(
        x_evidence,
        left,
        radius,
        cross_start=refined_top,
        cross_end=refined_bottom,
        axis="x",
        full_span_support=_full_span_support,
    )
    refined_right = _best_outer_boundary(
        x_evidence,
        right,
        radius,
        cross_start=refined_top,
        cross_end=refined_bottom,
        axis="x",
        full_span_support=_full_span_support,
    )

    pitch_x = (refined_right - refined_left) / columns
    pitch_y = (refined_bottom - refined_top) / rows
    if not (
        cell_size * 0.72 <= pitch_x <= cell_size * 1.28
        and cell_size * 0.72 <= pitch_y <= cell_size * 1.28
    ):
        return left, top, right, bottom
    return refined_left, refined_top, refined_right, refined_bottom


def _best_outer_boundary(
    evidence: object,
    expected: int,
    radius: int,
    *,
    cross_start: int,
    cross_end: int,
    axis: str,
    full_span_support: object,
) -> int:
    profile = evidence.profile
    mask = evidence.mask
    peak = max(float(profile.max(initial=0)), 1e-9)
    start = max(0, expected - radius)
    end = min(profile.size - 1, expected + radius)
    expected_support = full_span_support(
        mask,
        (expected,),
        cross_start,
        cross_end,
        axis=axis,
    )
    if expected_support >= 0.98:
        return expected
    best = expected
    best_key = (-1.0, -1.0, -math.inf)
    for position in range(start, end + 1):
        support = full_span_support(
            mask,
            (position,),
            cross_start,
            cross_end,
            axis=axis,
        )
        local_profile = float(
            profile[max(0, position - 1) : position + 2].max(initial=0)
        )
        key = (
            round(support, 3),
            local_profile / peak,
            -abs(position - expected),
        )
        if key > best_key:
            best = position
            best_key = key
    return best


def _projection_line_candidate(
    rgb: np.ndarray,
) -> LatticeCandidate | None:
    float_rgb = rgb.astype(np.float32)
    x_changes = np.zeros(rgb.shape[1], dtype=np.float64)
    y_changes = np.zeros(rgb.shape[0], dtype=np.float64)
    x_changes[1:] = np.mean(
        np.linalg.norm(np.diff(float_rgb, axis=1), axis=2),
        axis=0,
    )
    y_changes[1:] = np.mean(
        np.linalg.norm(np.diff(float_rgb, axis=0), axis=2),
        axis=1,
    )
    x_changes = cv2.GaussianBlur(
        x_changes.reshape(1, -1), (0, 0), 0.8
    ).reshape(-1)
    y_changes = cv2.GaussianBlur(
        y_changes.reshape(-1, 1), (0, 0), 0.8
    ).reshape(-1)
    x_periods = period_candidates(
        x_changes,
        minimum=3,
        maximum=max(3, min(rgb.shape[1] // 3, 180)),
    )
    y_periods = period_candidates(
        y_changes,
        minimum=3,
        maximum=max(3, min(rgb.shape[0] // 3, 180)),
    )
    if not x_periods or not y_periods:
        return None

    best: tuple[float, LatticeCandidate] | None = None
    for x_period in x_periods[:4]:
        x_run = _fit_profile_run(x_changes, round(x_period.period))
        if x_run is None:
            continue
        for y_period in y_periods[:4]:
            y_run = _fit_profile_run(y_changes, round(y_period.period))
            if y_run is None:
                continue
            x_boundaries, x_coverage = x_run
            y_boundaries, y_coverage = y_run
            columns = len(x_boundaries) - 1
            rows = len(y_boundaries) - 1
            if not (2 <= columns <= 300 and 2 <= rows <= 300):
                continue
            left, right = x_boundaries[0], x_boundaries[-1]
            top, bottom = y_boundaries[0], y_boundaries[-1]
            width = right - left
            height = bottom - top
            coverage = min(x_coverage, y_coverage)
            periodicity = min(x_period.score, y_period.score)
            harmonic_margin = min(
                x_period.harmonic_margin, y_period.harmonic_margin
            )
            confidence = max(
                0.0,
                min(
                    0.9,
                    coverage * 0.45
                    + periodicity * 0.3
                    + harmonic_margin * 0.15,
                ),
            )
            metrics = EvidenceMetrics(
                line_coverage=coverage,
                lattice_inlier_ratio=coverage,
                normalized_residual=max(0.0, 1 - coverage),
                periodicity_score=periodicity,
                harmonic_margin=harmonic_margin,
                boundary_support=coverage,
                cell_consistency=coverage,
                hypothesis_agreement=(coverage + periodicity) / 2,
            )
            candidate = LatticeCandidate(
                detector="periodic",
                style="mixed",
                mirror_frame="explicit-grid",
                source_quad=rectangle_quad(left, top, right, bottom),
                rectified_width=width,
                rectified_height=height,
                pitch_x=width / columns,
                pitch_y=height / rows,
                columns=columns,
                rows=rows,
                x_boundaries=canonical_boundaries(width, columns),
                y_boundaries=canonical_boundaries(height, rows),
                confidence=confidence,
                review="review",
                metrics=metrics,
                warnings=("GRID_PERIODIC_ONLY",),
                score=confidence + coverage * 0.18,
            )
            area_factor = min(
                1.0,
                width * height / max(1, rgb.shape[0] * rgb.shape[1]),
            )
            key = candidate.score + area_factor * 0.08
            if best is None or key > best[0]:
                best = (key, candidate)
    return best[1] if best else None


def _fit_profile_run(
    profile: np.ndarray,
    period: int,
) -> tuple[tuple[int, ...], float] | None:
    if period < 3 or profile.size < period * 2:
        return None
    baseline = float(np.median(profile))
    high = float(np.percentile(profile, 88))
    if high <= baseline + 0.2:
        return None
    tolerance = max(1, min(3, round(period * 0.1)))
    best_phase = 0
    best_score = -math.inf
    for phase in range(period):
        positions = range(phase, profile.size, period)
        values = [
            float(
                profile[
                    max(0, position - tolerance) : min(
                        profile.size, position + tolerance + 1
                    )
                ].max(initial=0)
            )
            for position in positions
        ]
        if values and float(np.mean(values)) > best_score:
            best_score = float(np.mean(values))
            best_phase = phase

    positions = list(range(best_phase, profile.size, period))
    threshold = baseline + (high - baseline) * 0.42
    supported = [
        float(
            profile[
                max(0, position - tolerance) : min(
                    profile.size, position + tolerance + 1
                )
            ].max(initial=0)
        )
        >= threshold
        for position in positions
    ]
    runs: list[tuple[int, int, int]] = []
    start: int | None = None
    misses = 0
    for index, is_supported in enumerate(supported + [False, False]):
        if is_supported:
            if start is None:
                start = index
            continue
        if start is not None and misses == 0 and index + 1 < len(supported):
            misses = 1
            continue
        if start is not None:
            end = index - misses
            if end - start + 1 >= 3:
                runs.append((start, end, misses))
        start = None
        misses = 0
    if not runs:
        return None
    start, end, _misses = max(
        runs,
        key=lambda item: (
            item[1] - item[0],
            sum(supported[item[0] : item[1] + 1]),
        ),
    )
    boundary_values = list(positions[start : end + 1])
    if (
        boundary_values
        and boundary_values[0] <= period + tolerance
        and boundary_values[0] >= period * 0.55
    ):
        boundary_values.insert(0, max(0, boundary_values[0] - period))
    if (
        boundary_values
        and period * 0.55
        <= profile.size - boundary_values[-1]
        <= period + tolerance
        and boundary_values[-1] < profile.size
    ):
        boundary_values.append(
            min(profile.size, boundary_values[-1] + period)
        )
    boundaries = tuple(boundary_values)
    if len(boundaries) < 3:
        return None
    coverage = sum(supported[start : end + 1]) / len(boundaries)
    return boundaries, coverage
