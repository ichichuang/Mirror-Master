from __future__ import annotations

from dataclasses import replace

import cv2
import numpy as np
from PIL import Image

from app.chart_detection.components import detect_component_candidates
from app.chart_detection.geometry import (
    quad_dimensions,
    rectify_rgba,
    validate_source_quad,
)
from app.chart_detection.line_grid import detect_line_candidates
from app.chart_detection.types import LatticeCandidate, QuadTuple
from app.errors import ApiError


def detect_rectified_candidates(
    source: Image.Image,
    image_sha256: str,
) -> tuple[LatticeCandidate, ...]:
    rgba = np.asarray(source.convert("RGBA"))
    detected: list[LatticeCandidate] = []
    for quad in propose_quadrilaterals(rgba[:, :, :3])[:2]:
        try:
            validate_source_quad(quad, source.size)
        except ApiError:
            continue
        estimated_width, estimated_height = quad_dimensions(quad)
        width = max(16, round(estimated_width))
        height = max(16, round(estimated_height))
        scale = min(1.0, 1800 / max(width, height))
        width = max(16, round(width * scale))
        height = max(16, round(height * scale))
        rectified = rectify_rgba(rgba, quad, width, height)
        rectified_image = Image.fromarray(rectified.rgba, mode="RGBA")
        inner_candidates = [
            *detect_component_candidates(rectified.rgba[:, :, :3]),
            *detect_line_candidates(rectified_image, image_sha256),
        ]
        for inner in inner_candidates[:3]:
            projected_quad = _project_quad(
                inner.source_quad,
                rectified.inverse,
            )
            warnings = tuple(
                dict.fromkeys(
                    (*inner.warnings, "GRID_PERSPECTIVE_REVIEW_REQUIRED")
                )
            )
            detected.append(
                replace(
                    inner,
                    detector="rectified",
                    source_quad=projected_quad,
                    review="review",
                    warnings=warnings,
                    confidence=max(0.0, inner.confidence - 0.08),
                    score=inner.score - 0.1,
                )
            )
    return tuple(detected)


def propose_quadrilaterals(rgb: np.ndarray) -> tuple[QuadTuple, ...]:
    height, width = rgb.shape[:2]
    image_area = height * width
    gray = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
    edges = cv2.Canny(blurred, 35, 120)
    edges = cv2.morphologyEx(
        edges,
        cv2.MORPH_CLOSE,
        cv2.getStructuringElement(cv2.MORPH_RECT, (7, 7)),
        iterations=2,
    )
    contours, _hierarchy = cv2.findContours(
        edges,
        cv2.RETR_LIST,
        cv2.CHAIN_APPROX_SIMPLE,
    )
    proposals: list[tuple[float, QuadTuple]] = []
    for contour in contours:
        area = float(abs(cv2.contourArea(contour)))
        if area < image_area * 0.08 or area > image_area * 0.96:
            continue
        perimeter = float(cv2.arcLength(contour, True))
        if perimeter <= 0:
            continue
        approximated = cv2.approxPolyDP(
            contour,
            0.02 * perimeter,
            True,
        )
        if len(approximated) != 4 or not cv2.isContourConvex(approximated):
            continue
        points = approximated.reshape(4, 2).astype(np.float64)
        quad = _order_quad(points)
        edge_lengths = [
            float(np.linalg.norm(points[index] - points[(index + 1) % 4]))
            for index in range(4)
        ]
        if min(edge_lengths) < 12:
            continue
        rectangularity = area / max(
            1.0,
            quad_dimensions(quad)[0] * quad_dimensions(quad)[1],
        )
        proposals.append((area * min(1.0, rectangularity), quad))

    proposals.sort(key=lambda item: item[0], reverse=True)
    selected: list[QuadTuple] = []
    for _score, proposal in proposals:
        if any(_quads_are_close(proposal, existing) for existing in selected):
            continue
        selected.append(proposal)
        if len(selected) == 3:
            break
    return tuple(selected)


def _order_quad(points: np.ndarray) -> QuadTuple:
    sums = points[:, 0] + points[:, 1]
    differences = points[:, 1] - points[:, 0]
    ordered = (
        points[int(np.argmin(sums))],
        points[int(np.argmin(differences))],
        points[int(np.argmax(sums))],
        points[int(np.argmax(differences))],
    )
    return tuple(
        (float(point[0]), float(point[1])) for point in ordered
    )  # type: ignore[return-value]


def _project_quad(
    quad: QuadTuple,
    transform: np.ndarray,
) -> QuadTuple:
    points = np.asarray(quad, dtype=np.float32).reshape(1, 4, 2)
    projected = cv2.perspectiveTransform(points, transform)[0]
    return tuple(
        (float(point[0]), float(point[1])) for point in projected
    )  # type: ignore[return-value]


def _quads_are_close(left: QuadTuple, right: QuadTuple) -> bool:
    left_points = np.asarray(left)
    right_points = np.asarray(right)
    diagonal = max(
        1.0,
        float(np.linalg.norm(left_points[0] - left_points[2])),
        float(np.linalg.norm(right_points[0] - right_points[2])),
    )
    return float(
        np.mean(np.linalg.norm(left_points - right_points, axis=1))
    ) <= diagonal * 0.04
