from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Literal

import cv2
import numpy as np
from PIL import Image

from app.errors import ApiError
from app.models import DetectionRectangle, GridDetectionResponse

DetectionMode = Literal["auto", "manual"]

MIN_CELL_SIZE = 3
MIN_BOUNDARY_COUNT = 6
MAX_HARMONIC_DIVISOR = 6
MAX_SPACING_DISAGREEMENT = 2
MAX_AXIS_OBSERVATIONS = 64
MAX_SHARED_CANDIDATES = 72


@dataclass(frozen=True, slots=True)
class LineCluster:
    center: int
    weight: float
    width: int


@dataclass(frozen=True, slots=True)
class AxisEvidence:
    profile: np.ndarray
    mask: np.ndarray
    clusters: tuple[LineCluster, ...]


@dataclass(frozen=True, slots=True)
class SpacingObservation:
    value: float
    weight: float


@dataclass(frozen=True, slots=True)
class SpacingCandidate:
    cell_size: int
    evidence_weight: float


@dataclass(frozen=True, slots=True)
class AxisFit:
    start: int
    end: int
    boundaries: tuple[int, ...]
    matched: int
    evidence_coverage: float
    evidence_score: float

    @property
    def span(self) -> int:
        return self.end - self.start


@dataclass(frozen=True, slots=True)
class GridFit:
    cell_size: int
    x_boundaries: tuple[int, ...]
    y_boundaries: tuple[int, ...]
    evidence_weight: float
    x_coverage: float
    y_coverage: float
    x_full_span: float
    y_full_span: float
    warning: str | None = None

    @property
    def left(self) -> int:
        return self.x_boundaries[0]

    @property
    def right(self) -> int:
        return self.x_boundaries[-1]

    @property
    def top(self) -> int:
        return self.y_boundaries[0]

    @property
    def bottom(self) -> int:
        return self.y_boundaries[-1]

    @property
    def columns(self) -> int:
        return len(self.x_boundaries) - 1

    @property
    def rows(self) -> int:
        return len(self.y_boundaries) - 1


@dataclass(frozen=True, slots=True)
class BandDescriptor:
    occupied_ratio: float
    dark_ratio: float
    saturated_ratio: float

    @property
    def label_like(self) -> bool:
        return (
            self.occupied_ratio >= 0.65
            and 0.015 <= self.dark_ratio <= 0.30
            and self.saturated_ratio <= 0.22
        )


def detect_grid(
    source: Image.Image,
    image_sha256: str,
    mode: DetectionMode,
    rectangle: DetectionRectangle | None,
) -> GridDetectionResponse:
    rgb = np.asarray(source.convert("RGB"))
    gray = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)
    x_evidence, y_evidence = _extract_line_evidence(gray, include_hough=False)
    candidates = _shared_spacing_candidates(x_evidence, y_evidence)

    if not candidates:
        x_evidence, y_evidence = _extract_line_evidence(
            gray, include_hough=True
        )
        candidates = _shared_spacing_candidates(x_evidence, y_evidence)

    if not candidates:
        raise ApiError(
            422,
            "GRID_FUNDAMENTAL_SPACING_MISSING",
            "未找到横纵一致的重复网格间距。",
        )

    if mode == "auto":
        fit = _detect_auto_grid(
            rgb, gray, x_evidence, y_evidence, candidates
        )
    else:
        if rectangle is None:
            raise ApiError(
                422,
                "GRID_RECTANGLE_REQUIRED",
                "手动模式缺少完整的半开坐标选区。",
            )
        _validate_rectangle(rectangle, source.size)
        fit = _detect_manual_grid(
            gray, x_evidence, y_evidence, candidates, rectangle
        )

    confidence = _confidence(fit)
    warning = fit.warning
    if warning is None and confidence < 0.68:
        warning = "识别置信度较低，请调整选区后复核。"

    return GridDetectionResponse(
        imageSha256=image_sha256,
        naturalWidth=source.width,
        naturalHeight=source.height,
        left=fit.left,
        top=fit.top,
        right=fit.right,
        bottom=fit.bottom,
        cellSize=fit.cell_size,
        columns=fit.columns,
        rows=fit.rows,
        xBoundaries=list(fit.x_boundaries),
        yBoundaries=list(fit.y_boundaries),
        confidence=float(round(confidence, 4)),
        warning=warning,
    )


def _extract_line_evidence(
    gray: np.ndarray, *, include_hough: bool
) -> tuple[AxisEvidence, AxisEvidence]:
    height, width = gray.shape
    block_size = _adaptive_block_size(width, height)
    binary = cv2.adaptiveThreshold(
        gray,
        255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY_INV,
        block_size,
        5,
    )
    vertical_length = max(7, round(height * 0.045))
    horizontal_length = max(7, round(width * 0.045))
    vertical = cv2.morphologyEx(
        binary,
        cv2.MORPH_OPEN,
        cv2.getStructuringElement(
            cv2.MORPH_RECT, (1, vertical_length)
        ),
    )
    horizontal = cv2.morphologyEx(
        binary,
        cv2.MORPH_OPEN,
        cv2.getStructuringElement(
            cv2.MORPH_RECT, (horizontal_length, 1)
        ),
    )

    if include_hough:
        _add_hough_evidence(gray, vertical, horizontal)

    x_profile = (vertical > 0).mean(axis=0, dtype=np.float64)
    y_profile = (horizontal > 0).mean(axis=1, dtype=np.float64)
    return (
        AxisEvidence(
            profile=x_profile,
            mask=vertical > 0,
            clusters=_cluster_line_pixels(x_profile),
        ),
        AxisEvidence(
            profile=y_profile,
            mask=horizontal > 0,
            clusters=_cluster_line_pixels(y_profile),
        ),
    )


def _add_hough_evidence(
    gray: np.ndarray, vertical: np.ndarray, horizontal: np.ndarray
) -> None:
    height, width = gray.shape
    shortest = min(width, height)
    edges = cv2.Canny(gray, 50, 150, apertureSize=3)
    lines = cv2.HoughLinesP(
        edges,
        1,
        np.pi / 180,
        threshold=max(16, round(shortest * 0.025)),
        minLineLength=max(12, round(shortest * 0.06)),
        maxLineGap=max(4, round(shortest * 0.025)),
    )
    if lines is None:
        return

    for raw_line in lines[:, 0]:
        x1, y1, x2, y2 = (int(value) for value in raw_line)
        delta_x = abs(x2 - x1)
        delta_y = abs(y2 - y1)
        if delta_x <= max(2, delta_y * 0.025):
            x = round((x1 + x2) / 2)
            cv2.line(vertical, (x, y1), (x, y2), 255, 1)
        elif delta_y <= max(2, delta_x * 0.025):
            y = round((y1 + y2) / 2)
            cv2.line(horizontal, (x1, y), (x2, y), 255, 1)


def _cluster_line_pixels(profile: np.ndarray) -> tuple[LineCluster, ...]:
    peak = float(profile.max(initial=0))
    if peak <= 0:
        return ()

    threshold = max(
        0.02, peak * 0.12, float(np.percentile(profile, 82)) * 0.42
    )
    maximum_width = max(7, round(profile.size * 0.012))
    indices = np.flatnonzero(profile >= threshold)
    if indices.size == 0:
        return ()

    groups: list[tuple[int, int]] = []
    start = previous = int(indices[0])
    for raw_index in indices[1:]:
        index = int(raw_index)
        if index - previous > 2:
            groups.append((start, previous))
            start = index
        previous = index
    groups.append((start, previous))

    clusters: list[LineCluster] = []
    for start, end in groups:
        width = end - start + 1
        if width > maximum_width:
            continue
        values = profile[start : end + 1]
        weight = float(values.sum())
        if weight <= 0:
            continue
        positions = np.arange(start, end + 1)
        center = round(float(np.dot(positions, values) / weight))
        cluster = LineCluster(center=center, weight=weight, width=width)
        previous_cluster = clusters[-1] if clusters else None
        if previous_cluster is None or center - previous_cluster.center > 2:
            clusters.append(cluster)
            continue
        total_weight = previous_cluster.weight + weight
        clusters[-1] = LineCluster(
            center=round(
                (
                    previous_cluster.center * previous_cluster.weight
                    + center * weight
                )
                / total_weight
            ),
            weight=total_weight,
            width=max(previous_cluster.width, width),
        )
    return tuple(clusters)


def _collect_spacing_observations(
    clusters: tuple[LineCluster, ...],
) -> tuple[SpacingObservation, ...]:
    raw: list[SpacingObservation] = []
    for left_index, left in enumerate(clusters):
        for right in clusters[
            left_index + 1 : min(len(clusters), left_index + 10)
        ]:
            distance = right.center - left.center
            for divisor in range(1, MAX_HARMONIC_DIVISOR + 1):
                spacing = distance / divisor
                if spacing < MIN_CELL_SIZE:
                    break
                raw.append(
                    SpacingObservation(
                        value=spacing,
                        weight=min(left.weight, right.weight)
                        / max(1, divisor * 0.75),
                    )
                )

    ordered = sorted(raw, key=lambda item: item.value)
    groups: list[list[float]] = []
    for observation in ordered:
        previous_value = (
            groups[-1][0] / groups[-1][1] if groups else -math.inf
        )
        if not groups or abs(observation.value - previous_value) > 1.25:
            groups.append(
                [
                    observation.value * observation.weight,
                    observation.weight,
                ]
            )
        else:
            groups[-1][0] += observation.value * observation.weight
            groups[-1][1] += observation.weight

    grouped = [
        SpacingObservation(value=weighted / weight, weight=weight)
        for weighted, weight in groups
        if weight > 0
    ]
    return tuple(
        sorted(grouped, key=lambda item: item.weight, reverse=True)[
            :MAX_AXIS_OBSERVATIONS
        ]
    )


def _shared_spacing_candidates(
    x_evidence: AxisEvidence, y_evidence: AxisEvidence
) -> tuple[SpacingCandidate, ...]:
    if (
        len(x_evidence.clusters) < MIN_BOUNDARY_COUNT
        or len(y_evidence.clusters) < MIN_BOUNDARY_COUNT
    ):
        return ()

    x_observations = _collect_spacing_observations(x_evidence.clusters)
    y_observations = _collect_spacing_observations(y_evidence.clusters)
    by_cell_size: dict[int, SpacingCandidate] = {}
    for x_observation in x_observations:
        for y_observation in y_observations:
            if (
                abs(x_observation.value - y_observation.value)
                > MAX_SPACING_DISAGREEMENT
            ):
                continue
            cell_size = round(
                (x_observation.value + y_observation.value) / 2
            )
            if cell_size < MIN_CELL_SIZE:
                continue
            evidence_weight = math.sqrt(
                x_observation.weight * y_observation.weight
            )
            candidate = SpacingCandidate(
                cell_size=cell_size, evidence_weight=evidence_weight
            )
            previous = by_cell_size.get(cell_size)
            if previous is None or candidate.evidence_weight > (
                previous.evidence_weight
            ):
                by_cell_size[cell_size] = candidate

    return tuple(
        sorted(
            by_cell_size.values(),
            key=lambda item: (-item.evidence_weight, item.cell_size),
        )[:MAX_SHARED_CANDIDATES]
    )


def _detect_auto_grid(
    rgb: np.ndarray,
    gray: np.ndarray,
    x_evidence: AxisEvidence,
    y_evidence: AxisEvidence,
    candidates: tuple[SpacingCandidate, ...],
) -> GridFit:
    evaluated: list[GridFit] = []
    for candidate in candidates:
        x_fit = _best_axis_run(
            gray, x_evidence, candidate.cell_size, axis="x"
        )
        y_fit = _best_axis_run(
            gray, y_evidence, candidate.cell_size, axis="y"
        )
        if x_fit is None or y_fit is None:
            continue

        x_boundaries, y_boundaries = _strip_outer_label_bands(
            rgb,
            x_fit.boundaries,
            y_fit.boundaries,
            candidate.cell_size,
        )
        if (
            len(x_boundaries) < MIN_BOUNDARY_COUNT
            or len(y_boundaries) < MIN_BOUNDARY_COUNT
        ):
            continue

        x_full_span = _full_span_support(
            x_evidence.mask,
            x_boundaries,
            y_boundaries[0],
            y_boundaries[-1],
            axis="x",
        )
        y_full_span = _full_span_support(
            y_evidence.mask,
            y_boundaries,
            x_boundaries[0],
            x_boundaries[-1],
            axis="y",
        )
        if min(x_full_span, y_full_span) < 0.22:
            continue

        evaluated.append(
            GridFit(
                cell_size=candidate.cell_size,
                x_boundaries=x_boundaries,
                y_boundaries=y_boundaries,
                evidence_weight=candidate.evidence_weight,
                x_coverage=x_fit.evidence_coverage,
                y_coverage=y_fit.evidence_coverage,
                x_full_span=x_full_span,
                y_full_span=y_full_span,
            )
        )

    if not evaluated:
        raise ApiError(
            422,
            "GRID_BODY_NOT_COHERENT",
            "重复网格线未形成横纵完整贯通的内部网格区域。",
        )

    ranked = sorted(evaluated, key=_auto_rank_key, reverse=True)
    return _prefer_fundamental(ranked[0], ranked)


def _best_axis_run(
    gray: np.ndarray,
    evidence: AxisEvidence,
    cell_size: int,
    *,
    axis: Literal["x", "y"],
) -> AxisFit | None:
    peak = float(evidence.profile.max(initial=0))
    if peak <= 0:
        return None

    threshold = max(0.018, peak * 0.10)
    match_radius = max(1, min(4, round(cell_size * 0.1)))
    phases = _candidate_phases(evidence.clusters, cell_size)
    best: tuple[tuple[float, ...], AxisFit] | None = None

    for phase in phases:
        positions = list(range(phase, evidence.profile.size, cell_size))
        if len(positions) < MIN_BOUNDARY_COUNT:
            continue
        supports = [
            _local_profile_max(evidence.profile, position, match_radius)
            for position in positions
        ]
        run_start: int | None = None
        for index in range(len(positions) + 1):
            supported = (
                index < len(positions) and supports[index] >= threshold
            )
            if supported and run_start is None:
                run_start = index
            if supported:
                continue
            if run_start is None:
                continue

            run_end = index - 1
            count = run_end - run_start + 1
            if count >= MIN_BOUNDARY_COUNT:
                rough = positions[run_start : run_end + 1]
                refined = _refine_phase(
                    gray, rough, cell_size, axis=axis
                )
                boundaries = tuple(
                    refined + offset * cell_size
                    for offset in range(count)
                )
                if boundaries[0] < 0 or boundaries[-1] > (
                    evidence.profile.size
                ):
                    run_start = None
                    continue
                refined_supports = [
                    _local_profile_max(evidence.profile, position, 2)
                    for position in boundaries
                ]
                matched = sum(
                    value >= threshold for value in refined_supports
                )
                coverage = matched / count
                score = sum(refined_supports) / (count * peak)
                fit = AxisFit(
                    start=boundaries[0],
                    end=boundaries[-1],
                    boundaries=boundaries,
                    matched=matched,
                    evidence_coverage=coverage,
                    evidence_score=score,
                )
                key = (
                    fit.span,
                    fit.matched,
                    fit.evidence_coverage,
                    fit.evidence_score,
                    -fit.start,
                )
                if best is None or key > best[0]:
                    best = (key, fit)
            run_start = None

    return best[1] if best else None


def _candidate_phases(
    clusters: tuple[LineCluster, ...], cell_size: int
) -> tuple[int, ...]:
    phases: set[int] = set()
    for cluster in clusters:
        phase = cluster.center % cell_size
        for offset in range(-4, 5):
            phases.add((phase + offset) % cell_size)
    if not phases:
        phases.update(range(cell_size))
    return tuple(sorted(phases))


def _refine_phase(
    gray: np.ndarray,
    rough_boundaries: list[int],
    cell_size: int,
    *,
    axis: Literal["x", "y"],
) -> int:
    radius = max(2, min(6, round(cell_size * 0.15)))
    best_offset = 0
    best_score = -math.inf
    axis_extent = gray.shape[1] if axis == "x" else gray.shape[0]

    for offset in range(-radius, radius + 1):
        positions = [
            position + offset
            for position in rough_boundaries
            if 0 <= position + offset < axis_extent - 1
        ]
        if len(positions) < MIN_BOUNDARY_COUNT:
            continue
        if axis == "x":
            score = float(
                np.mean(
                    [
                        np.mean(
                            gray[:, position + 1].astype(np.float32)
                            - gray[:, position].astype(np.float32)
                        )
                        for position in positions
                    ]
                )
            )
        else:
            score = float(
                np.mean(
                    [
                        np.mean(
                            gray[position + 1, :].astype(np.float32)
                            - gray[position, :].astype(np.float32)
                        )
                        for position in positions
                    ]
                )
            )
        if score > best_score:
            best_score = score
            best_offset = offset

    return rough_boundaries[0] + best_offset


def _strip_outer_label_bands(
    rgb: np.ndarray,
    x_boundaries: tuple[int, ...],
    y_boundaries: tuple[int, ...],
    cell_size: int,
) -> tuple[tuple[int, ...], tuple[int, ...]]:
    gray = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)
    saturation = cv2.cvtColor(rgb, cv2.COLOR_RGB2HSV)[:, :, 1]
    height, width = gray.shape

    y_boundaries = _strip_axis_labels(
        gray,
        saturation,
        y_boundaries,
        x_boundaries,
        cell_size,
        axis="y",
        extent=height,
    )
    x_boundaries = _strip_axis_labels(
        gray,
        saturation,
        x_boundaries,
        y_boundaries,
        cell_size,
        axis="x",
        extent=width,
    )
    return x_boundaries, y_boundaries


def _strip_axis_labels(
    gray: np.ndarray,
    saturation: np.ndarray,
    boundaries: tuple[int, ...],
    cross_boundaries: tuple[int, ...],
    cell_size: int,
    *,
    axis: Literal["x", "y"],
    extent: int,
) -> tuple[int, ...]:
    if len(boundaries) < MIN_BOUNDARY_COUNT + 2:
        return boundaries

    first = _band_descriptor(
        gray,
        saturation,
        boundaries[0],
        boundaries[1],
        cross_boundaries,
        axis=axis,
    )
    last = _band_descriptor(
        gray,
        saturation,
        boundaries[-2],
        boundaries[-1],
        cross_boundaries,
        axis=axis,
    )

    if first.label_like and last.label_like and _bands_similar(first, last):
        return boundaries[1:-1]

    before: BandDescriptor | None = None
    after: BandDescriptor | None = None
    if boundaries[0] - cell_size >= 0:
        before = _band_descriptor(
            gray,
            saturation,
            boundaries[0] - cell_size,
            boundaries[0],
            cross_boundaries,
            axis=axis,
        )
    if boundaries[-1] + cell_size <= extent:
        after = _band_descriptor(
            gray,
            saturation,
            boundaries[-1],
            boundaries[-1] + cell_size,
            cross_boundaries,
            axis=axis,
        )

    if (
        first.label_like
        and after is not None
        and after.label_like
        and _bands_similar(first, after)
    ):
        boundaries = boundaries[1:]
    if (
        last.label_like
        and before is not None
        and before.label_like
        and _bands_similar(last, before)
    ):
        boundaries = boundaries[:-1]
    return boundaries


def _band_descriptor(
    gray: np.ndarray,
    saturation: np.ndarray,
    start: int,
    end: int,
    cross_boundaries: tuple[int, ...],
    *,
    axis: Literal["x", "y"],
) -> BandDescriptor:
    occupied = 0
    sampled = 0
    dark_pixels = 0
    saturated_pixels = 0
    total_pixels = 0
    band_margin = max(2, round((end - start) * 0.12))

    for cross_start, cross_end in zip(
        cross_boundaries, cross_boundaries[1:]
    ):
        cross_margin = max(2, round((cross_end - cross_start) * 0.12))
        if axis == "y":
            crop = gray[
                start + band_margin : end - band_margin,
                cross_start + cross_margin : cross_end - cross_margin,
            ]
            saturation_crop = saturation[
                start + band_margin : end - band_margin,
                cross_start + cross_margin : cross_end - cross_margin,
            ]
        else:
            crop = gray[
                cross_start + cross_margin : cross_end - cross_margin,
                start + band_margin : end - band_margin,
            ]
            saturation_crop = saturation[
                cross_start + cross_margin : cross_end - cross_margin,
                start + band_margin : end - band_margin,
            ]
        if crop.size == 0:
            continue
        dark = crop < 180
        occupied += float(dark.mean()) >= 0.004
        sampled += 1
        dark_pixels += int(dark.sum())
        saturated_pixels += int((saturation_crop > 40).sum())
        total_pixels += int(crop.size)

    if sampled == 0 or total_pixels == 0:
        return BandDescriptor(0, 0, 0)
    return BandDescriptor(
        occupied_ratio=occupied / sampled,
        dark_ratio=dark_pixels / total_pixels,
        saturated_ratio=saturated_pixels / total_pixels,
    )


def _bands_similar(left: BandDescriptor, right: BandDescriptor) -> bool:
    return (
        abs(left.occupied_ratio - right.occupied_ratio) <= 0.25
        and abs(left.dark_ratio - right.dark_ratio) <= 0.08
        and abs(left.saturated_ratio - right.saturated_ratio) <= 0.10
    )


def _detect_manual_grid(
    gray: np.ndarray,
    x_evidence: AxisEvidence,
    y_evidence: AxisEvidence,
    candidates: tuple[SpacingCandidate, ...],
    rectangle: DetectionRectangle,
) -> GridFit:
    evaluated: list[GridFit] = []
    for candidate in candidates:
        cell_size = candidate.cell_size
        x_phase = _manual_phase(
            gray,
            x_evidence,
            cell_size,
            rectangle.left,
            rectangle.right,
            axis="x",
        )
        y_phase = _manual_phase(
            gray,
            y_evidence,
            cell_size,
            rectangle.top,
            rectangle.bottom,
            axis="y",
        )
        tolerance = max(3, round(cell_size * 0.25))
        left, left_snapped = _snap_edge(
            rectangle.left, x_phase, cell_size, tolerance
        )
        right, right_snapped = _snap_edge(
            rectangle.right, x_phase, cell_size, tolerance
        )
        top, top_snapped = _snap_edge(
            rectangle.top, y_phase, cell_size, tolerance
        )
        bottom, bottom_snapped = _snap_edge(
            rectangle.bottom, y_phase, cell_size, tolerance
        )
        if (
            left < 0
            or top < 0
            or right > x_evidence.profile.size
            or bottom > y_evidence.profile.size
            or right <= left
            or bottom <= top
            or (right - left) % cell_size != 0
            or (bottom - top) % cell_size != 0
        ):
            continue

        columns = (right - left) // cell_size
        rows = (bottom - top) // cell_size
        if columns < 2 or rows < 2:
            continue
        x_boundaries = tuple(
            left + index * cell_size for index in range(columns + 1)
        )
        y_boundaries = tuple(
            top + index * cell_size for index in range(rows + 1)
        )
        x_coverage = _profile_coverage(x_evidence, x_boundaries)
        y_coverage = _profile_coverage(y_evidence, y_boundaries)
        x_full_span = _full_span_support(
            x_evidence.mask,
            x_boundaries,
            top,
            bottom,
            axis="x",
        )
        y_full_span = _full_span_support(
            y_evidence.mask,
            y_boundaries,
            left,
            right,
            axis="y",
        )
        all_edges_snapped = (
            left_snapped and right_snapped and top_snapped and bottom_snapped
        )
        evidence_is_weak = (
            min(x_coverage, y_coverage) < 0.65
            or min(x_full_span, y_full_span) < 0.28
            or not all_edges_snapped
        )
        warning = (
            "线条证据较弱，已按完整选区返回网格，请在生成前复核。"
            if evidence_is_weak
            else None
        )
        evaluated.append(
            GridFit(
                cell_size=cell_size,
                x_boundaries=x_boundaries,
                y_boundaries=y_boundaries,
                evidence_weight=candidate.evidence_weight,
                x_coverage=x_coverage,
                y_coverage=y_coverage,
                x_full_span=x_full_span,
                y_full_span=y_full_span,
                warning=warning,
            )
        )

    if not evaluated:
        raise ApiError(
            422,
            "GRID_RECTANGLE_NOT_COMPLETE_SQUARES",
            "手动选区无法在允许吸附距离内形成完整的整数正方形单元。",
        )

    ranked = sorted(evaluated, key=_manual_rank_key, reverse=True)
    return _prefer_fundamental(ranked[0], ranked)


def _manual_phase(
    gray: np.ndarray,
    evidence: AxisEvidence,
    cell_size: int,
    start: int,
    end: int,
    *,
    axis: Literal["x", "y"],
) -> int:
    radius = max(1, min(4, round(cell_size * 0.1)))
    best_phase = 0
    best_score = -math.inf
    for phase in _candidate_phases(evidence.clusters, cell_size):
        positions = _phase_positions(
            phase, cell_size, start - cell_size, end + cell_size
        )
        positions = [
            position
            for position in positions
            if 0 <= position < evidence.profile.size
        ]
        if not positions:
            continue
        score = sum(
            _local_profile_max(evidence.profile, position, radius)
            for position in positions
        ) / len(positions)
        if score > best_score:
            best_score = score
            best_phase = phase

    rough = _phase_positions(
        best_phase, cell_size, start - cell_size, end + cell_size
    )
    refined_start = _refine_phase(gray, rough, cell_size, axis=axis)
    return refined_start % cell_size


def _snap_edge(
    value: int, phase: int, cell_size: int, tolerance: int
) -> tuple[int, bool]:
    nearest = phase + round((value - phase) / cell_size) * cell_size
    if abs(nearest - value) <= tolerance:
        return nearest, True
    return value, False


def _phase_positions(
    phase: int, cell_size: int, start: int, end: int
) -> list[int]:
    first_index = math.floor((start - phase) / cell_size)
    last_index = math.ceil((end - phase) / cell_size)
    return [
        phase + index * cell_size
        for index in range(first_index, last_index + 1)
    ]


def _profile_coverage(
    evidence: AxisEvidence, boundaries: tuple[int, ...]
) -> float:
    peak = float(evidence.profile.max(initial=0))
    if peak <= 0:
        return 0
    threshold = max(0.018, peak * 0.10)
    matched = sum(
        _local_profile_max(evidence.profile, position, 2) >= threshold
        for position in boundaries
    )
    return matched / len(boundaries)


def _full_span_support(
    mask: np.ndarray,
    boundaries: tuple[int, ...],
    cross_start: int,
    cross_end: int,
    *,
    axis: Literal["x", "y"],
) -> float:
    if cross_end <= cross_start:
        return 0
    supports: list[float] = []
    for boundary in boundaries:
        if axis == "x":
            start = max(0, boundary - 2)
            end = min(mask.shape[1], boundary + 3)
            pixels = mask[cross_start:cross_end, start:end]
            support = (
                np.max(pixels, axis=1).mean() if pixels.size else 0
            )
        else:
            start = max(0, boundary - 2)
            end = min(mask.shape[0], boundary + 3)
            pixels = mask[start:end, cross_start:cross_end]
            support = (
                np.max(pixels, axis=0).mean() if pixels.size else 0
            )
        supports.append(float(support))
    if not supports:
        return 0
    return float(np.mean(supports))


def _auto_rank_key(fit: GridFit) -> tuple[float, ...]:
    area = (fit.right - fit.left) * (fit.bottom - fit.top)
    minimum_span_support = min(fit.x_full_span, fit.y_full_span)
    minimum_coverage = min(fit.x_coverage, fit.y_coverage)
    boundary_count = len(fit.x_boundaries) + len(fit.y_boundaries)
    return (
        float(area),
        minimum_span_support,
        minimum_coverage,
        float(boundary_count),
        fit.evidence_weight,
        -float(fit.cell_size),
    )


def _manual_rank_key(fit: GridFit) -> tuple[float, ...]:
    return (
        min(fit.x_coverage, fit.y_coverage),
        min(fit.x_full_span, fit.y_full_span),
        fit.evidence_weight,
        float(len(fit.x_boundaries) + len(fit.y_boundaries)),
        -float(fit.cell_size),
    )


def _prefer_fundamental(
    selected: GridFit, ranked: list[GridFit]
) -> GridFit:
    result = selected
    for candidate in ranked:
        if candidate.cell_size >= result.cell_size:
            continue
        if not _is_harmonic_pair(candidate.cell_size, result.cell_size):
            continue
        if (
            len(candidate.x_boundaries) < len(result.x_boundaries)
            or len(candidate.y_boundaries) < len(result.y_boundaries)
            or candidate.x_full_span < result.x_full_span
            or candidate.y_full_span < result.y_full_span
        ):
            continue
        result = candidate
    return result


def _is_harmonic_pair(smaller: int, larger: int) -> bool:
    return any(
        abs(larger - smaller * divisor) <= MAX_SPACING_DISAGREEMENT
        for divisor in range(2, MAX_HARMONIC_DIVISOR + 1)
    )


def _confidence(fit: GridFit) -> float:
    evidence = min(fit.x_coverage, fit.y_coverage)
    full_span = min(fit.x_full_span, fit.y_full_span)
    boundary_factor = min(1.0, (fit.columns + fit.rows) / 30)
    return max(
        0.0,
        min(
            1.0,
            evidence * 0.45 + full_span * 0.40 + boundary_factor * 0.15,
        ),
    )


def _validate_rectangle(
    rectangle: DetectionRectangle, image_size: tuple[int, int]
) -> None:
    width, height = image_size
    if (
        rectangle.left < 0
        or rectangle.top < 0
        or rectangle.right > width
        or rectangle.bottom > height
        or rectangle.right - rectangle.left < 8
        or rectangle.bottom - rectangle.top < 8
    ):
        raise ApiError(
            422,
            "GRID_RECTANGLE_INVALID",
            "手动选区必须是图片范围内至少 8 像素的半开整数矩形。",
        )


def _adaptive_block_size(width: int, height: int) -> int:
    target = round(min(width, height) / 24)
    clamped = min(81, max(15, target))
    return clamped + 1 if clamped % 2 == 0 else clamped


def _local_profile_max(
    profile: np.ndarray, position: int, radius: int
) -> float:
    start = max(0, round(position) - radius)
    end = min(profile.size, round(position) + radius + 1)
    if start >= end:
        return 0
    return float(profile[start:end].max(initial=0))
