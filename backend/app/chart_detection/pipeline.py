from __future__ import annotations

from dataclasses import replace

import numpy as np
from PIL import Image

from app.chart_detection.authority import sign_candidate_id
from app.chart_detection.cells import extract_cell_records, summarize_cells
from app.chart_detection.components import detect_component_candidates
from app.chart_detection.geometry import (
    candidate_rectified_rgba,
    canonical_boundaries,
    is_exact_axis_aligned_quad,
    quad_dimensions,
    rectangle_quad,
    validate_source_quad,
)
from app.chart_detection.line_grid import detect_line_candidates
from app.chart_detection.regions import detect_rectified_candidates
from app.chart_detection.types import (
    EvidenceMetrics,
    LatticeCandidate,
    QuadTuple,
)
from app.errors import ApiError
from app.models import (
    DetectionRectangle,
    GridCandidateV2,
    GridCellSummary,
    GridDetectionResultV2,
    GridEvidenceMetrics,
)

MAX_ANALYSIS_EDGE = 2000


def analyze_chart(
    source: Image.Image,
    image_sha256: str,
    *,
    mode: str,
    rectangle: DetectionRectangle | None,
    quad: QuadTuple | None,
    expected_columns: int | None,
    expected_rows: int | None,
) -> GridDetectionResultV2:
    rgba = np.asarray(source.convert("RGBA"))

    if mode == "manual":
        candidates = _manual_candidates(
            source,
            rectangle=rectangle,
            quad=quad,
            expected_columns=expected_columns,
            expected_rows=expected_rows,
        )
    else:
        analysis_source, analysis_scale = _analysis_image(source)
        analysis_rgb = np.asarray(analysis_source.convert("RGB"))
        candidates = [
            *detect_component_candidates(analysis_rgb),
            *detect_line_candidates(analysis_source, image_sha256),
            *detect_rectified_candidates(analysis_source, image_sha256),
        ]
        if analysis_scale != 1:
            candidates = [
                _map_candidate_to_natural(
                    candidate,
                    analysis_scale,
                    source.size,
                )
                for candidate in candidates
            ]

    candidates = _deduplicate_and_rank(candidates)
    if not candidates:
        raise ApiError(
            422,
            "GRID_LATTICE_NOT_FOUND",
            "没有找到可验证的全局格阵；请框选完整区域并填写实际行列数。",
        )

    response_candidates: list[GridCandidateV2] = []
    for candidate in candidates[:3]:
        validate_source_quad(candidate.source_quad, source.size)
        rectified = candidate_rectified_rgba(
            rgba,
            candidate.source_quad,
            candidate.rectified_width,
            candidate.rectified_height,
        )
        records = extract_cell_records(
            rectified,
            candidate.x_boundaries,
            candidate.y_boundaries,
        )
        summary = summarize_cells(records)
        uncertain_ratio = (
            summary.uncertain_cell_count / summary.total_cell_count
        )
        metrics = replace(
            candidate.metrics,
            cell_consistency=max(
                0.0,
                min(
                    1.0,
                    candidate.metrics.cell_consistency
                    * (1 - uncertain_ratio),
                ),
            ),
        )
        candidate_id = sign_candidate_id(
            candidate.detector,
            image_sha256=image_sha256,
            natural_width=source.width,
            natural_height=source.height,
            source_quad=candidate.source_quad,
            rectified_width=candidate.rectified_width,
            rectified_height=candidate.rectified_height,
            pitch_x=candidate.pitch_x,
            pitch_y=candidate.pitch_y,
            columns=candidate.columns,
            rows=candidate.rows,
            x_boundaries=candidate.x_boundaries,
            y_boundaries=candidate.y_boundaries,
            matrix_digest=summary.matrix_digest,
        )
        response_candidates.append(
            _to_response_candidate(
                candidate,
                candidate_id=candidate_id,
                metrics=metrics,
                summary=summary,
            )
        )

    return GridDetectionResultV2(
        contractVersion="2.0",
        imageSha256=image_sha256,
        naturalWidth=source.width,
        naturalHeight=source.height,
        selectedCandidateId=response_candidates[0].candidate_id,
        candidates=response_candidates,
    )


def _manual_candidates(
    source: Image.Image,
    *,
    rectangle: DetectionRectangle | None,
    quad: QuadTuple | None,
    expected_columns: int | None,
    expected_rows: int | None,
) -> list[LatticeCandidate]:
    if quad is None and rectangle is not None:
        quad = rectangle_quad(
            rectangle.left,
            rectangle.top,
            rectangle.right,
            rectangle.bottom,
        )
    if quad is None:
        raise ApiError(
            422,
            "GRID_MANUAL_REGION_REQUIRED",
            "手动模式需要完整矩形或按顺序提供四个角点。",
        )
    if expected_columns is None or expected_rows is None:
        raise ApiError(
            422,
            "GRID_EXPECTED_DIMENSIONS_REQUIRED",
            "手动模式需要同时填写实际列数和行数。",
        )
    if not (2 <= expected_columns <= 300 and 2 <= expected_rows <= 300):
        raise ApiError(
            422,
            "GRID_EXPECTED_DIMENSIONS_INVALID",
            "手动行列数必须在 2 到 300 之间。",
        )
    validate_source_quad(quad, source.size)
    estimated_width, estimated_height = quad_dimensions(quad)
    width = max(expected_columns, round(estimated_width))
    height = max(expected_rows, round(estimated_height))
    pitch_x = width / expected_columns
    pitch_y = height / expected_rows
    axis_aligned = is_exact_axis_aligned_quad(quad, width, height)
    warnings = ["GRID_MANUAL_GEOMETRY_REVIEW_REQUIRED"]
    if not axis_aligned:
        warnings.append("GRID_PERSPECTIVE_REVIEW_REQUIRED")
    metrics = EvidenceMetrics(
        line_coverage=0.0,
        lattice_inlier_ratio=1.0,
        normalized_residual=0.0,
        periodicity_score=0.0,
        harmonic_margin=1.0,
        boundary_support=1.0,
        cell_consistency=0.85,
        hypothesis_agreement=1.0,
    )
    return [
        LatticeCandidate(
            detector="manual",
            style="mixed",
            mirror_frame="manual-region",
            source_quad=quad,
            rectified_width=width,
            rectified_height=height,
            pitch_x=float(pitch_x),
            pitch_y=float(pitch_y),
            columns=expected_columns,
            rows=expected_rows,
            x_boundaries=canonical_boundaries(width, expected_columns),
            y_boundaries=canonical_boundaries(height, expected_rows),
            confidence=0.92,
            review="review",
            metrics=metrics,
            warnings=tuple(warnings),
            score=2.0,
        )
    ]


def _deduplicate_and_rank(
    candidates: list[LatticeCandidate],
) -> list[LatticeCandidate]:
    detector_bonus = {
        "manual": 0.5,
        "rectified": 0.25,
        "component": 0.22,
        "line": 0.18,
        "periodic": -0.12,
    }
    ranked = sorted(
        candidates,
        key=lambda candidate: (
            candidate.score + detector_bonus[candidate.detector],
            candidate.metrics.harmonic_margin,
            candidate.metrics.lattice_inlier_ratio,
            candidate.columns * candidate.rows,
        ),
        reverse=True,
    )
    selected: list[LatticeCandidate] = []
    for candidate in ranked:
        if candidate.columns < 2 or candidate.rows < 2:
            continue
        if any(
            _same_lattice(candidate, existing) for existing in selected
        ):
            continue
        selected.append(candidate)
        if len(selected) == 3:
            break
    return selected


def _same_lattice(
    left: LatticeCandidate, right: LatticeCandidate
) -> bool:
    if left.columns != right.columns or left.rows != right.rows:
        return False
    left_points = np.asarray(left.source_quad)
    right_points = np.asarray(right.source_quad)
    diagonal = max(
        1.0,
        np.linalg.norm(left_points[0] - left_points[2]),
        np.linalg.norm(right_points[0] - right_points[2]),
    )
    return float(np.mean(np.linalg.norm(left_points - right_points, axis=1))) <= (
        diagonal * 0.03
    )


def _to_response_candidate(
    candidate: LatticeCandidate,
    *,
    candidate_id: str,
    metrics: EvidenceMetrics,
    summary: GridCellSummary,
) -> GridCandidateV2:
    return GridCandidateV2(
        candidateId=candidate_id,
        detector=candidate.detector,
        style=candidate.style,
        mirrorFrame=candidate.mirror_frame,
        sourceQuad=[
            {"x": float(x), "y": float(y)}
            for x, y in candidate.source_quad
        ],
        rectifiedWidth=candidate.rectified_width,
        rectifiedHeight=candidate.rectified_height,
        pitchX=float(candidate.pitch_x),
        pitchY=float(candidate.pitch_y),
        columns=candidate.columns,
        rows=candidate.rows,
        xBoundaries=list(candidate.x_boundaries),
        yBoundaries=list(candidate.y_boundaries),
        confidence=float(round(candidate.confidence, 4)),
        review=candidate.review,
        metrics=GridEvidenceMetrics(
            lineCoverage=float(_bounded(metrics.line_coverage)),
            latticeInlierRatio=float(
                _bounded(metrics.lattice_inlier_ratio)
            ),
            normalizedResidual=float(
                _bounded(metrics.normalized_residual)
            ),
            periodicityScore=float(_bounded(metrics.periodicity_score)),
            harmonicMargin=float(_bounded(metrics.harmonic_margin)),
            boundarySupport=float(_bounded(metrics.boundary_support)),
            cellConsistency=float(_bounded(metrics.cell_consistency)),
            hypothesisAgreement=float(
                _bounded(metrics.hypothesis_agreement)
            ),
        ),
        cellSummary=summary,
        warnings=list(candidate.warnings),
    )


def _bounded(value: float) -> float:
    return round(max(0.0, min(1.0, value)), 4)


def _analysis_image(source: Image.Image) -> tuple[Image.Image, float]:
    longest_edge = max(source.size)
    if longest_edge <= MAX_ANALYSIS_EDGE:
        return source, 1.0
    scale = MAX_ANALYSIS_EDGE / longest_edge
    width = max(1, round(source.width * scale))
    height = max(1, round(source.height * scale))
    return (
        source.resize((width, height), Image.Resampling.LANCZOS),
        scale,
    )


def _map_candidate_to_natural(
    candidate: LatticeCandidate,
    scale: float,
    natural_size: tuple[int, int],
) -> LatticeCandidate:
    natural_width, natural_height = natural_size
    natural_quad = tuple(
        (
            min(float(natural_width), max(0.0, point[0] / scale)),
            min(float(natural_height), max(0.0, point[1] / scale)),
        )
        for point in candidate.source_quad
    )
    width = max(
        candidate.columns,
        round(candidate.rectified_width / scale),
    )
    height = max(
        candidate.rows,
        round(candidate.rectified_height / scale),
    )
    return replace(
        candidate,
        source_quad=natural_quad,  # type: ignore[arg-type]
        rectified_width=width,
        rectified_height=height,
        pitch_x=width / candidate.columns,
        pitch_y=height / candidate.rows,
        x_boundaries=canonical_boundaries(width, candidate.columns),
        y_boundaries=canonical_boundaries(height, candidate.rows),
    )
