from __future__ import annotations

import math

import cv2
import numpy as np

from app.chart_detection.types import QuadTuple, RectifiedImage
from app.errors import ApiError


def canonical_boundaries(extent: int, cells: int) -> tuple[int, ...]:
    boundaries = [round(index * extent / cells) for index in range(cells + 1)]
    boundaries[0] = 0
    boundaries[-1] = extent
    return tuple(boundaries)


def rectangle_quad(
    left: float, top: float, right: float, bottom: float
) -> QuadTuple:
    return ((left, top), (right, top), (right, bottom), (left, bottom))


def validate_source_quad(
    quad: QuadTuple, image_size: tuple[int, int]
) -> None:
    width, height = image_size
    coordinates = np.asarray(quad, dtype=np.float64)
    if coordinates.shape != (4, 2) or not np.isfinite(coordinates).all():
        raise ApiError(
            422,
            "GRID_QUAD_INVALID",
            "四角选区必须包含四个有限坐标点。",
        )
    if (
        np.any(coordinates[:, 0] < 0)
        or np.any(coordinates[:, 1] < 0)
        or np.any(coordinates[:, 0] > width)
        or np.any(coordinates[:, 1] > height)
    ):
        raise ApiError(
            422,
            "GRID_QUAD_OUT_OF_BOUNDS",
            "四角选区超出归一化图片范围。",
        )

    cross_products: list[float] = []
    for index in range(4):
        previous = coordinates[index - 1]
        current = coordinates[index]
        following = coordinates[(index + 1) % 4]
        first = current - previous
        second = following - current
        cross_products.append(
            float(first[0] * second[1] - first[1] * second[0])
        )
    if any(abs(value) < 1e-6 for value in cross_products) or not (
        all(value > 0 for value in cross_products)
        or all(value < 0 for value in cross_products)
    ):
        raise ApiError(
            422,
            "GRID_QUAD_INVALID",
            "四角选区必须按边界顺序组成非自交凸四边形。",
        )
    if abs(cv2.contourArea(coordinates.astype(np.float32))) < 64:
        raise ApiError(
            422,
            "GRID_QUAD_TOO_SMALL",
            "四角选区面积过小，无法形成有效网格。",
        )


def quad_dimensions(quad: QuadTuple) -> tuple[float, float]:
    top = math.dist(quad[0], quad[1])
    right = math.dist(quad[1], quad[2])
    bottom = math.dist(quad[2], quad[3])
    left = math.dist(quad[3], quad[0])
    return ((top + bottom) / 2, (left + right) / 2)


def is_exact_axis_aligned_quad(
    quad: QuadTuple, rectified_width: int, rectified_height: int
) -> bool:
    left, top = quad[0]
    right, top_right = quad[1]
    right_bottom, bottom = quad[2]
    left_bottom, bottom_left = quad[3]
    values_are_integers = all(
        abs(value - round(value)) < 1e-7 for point in quad for value in point
    )
    return (
        values_are_integers
        and abs(top - top_right) < 1e-7
        and abs(bottom - bottom_left) < 1e-7
        and abs(left - left_bottom) < 1e-7
        and abs(right - right_bottom) < 1e-7
        and round(right - left) == rectified_width
        and round(bottom - top) == rectified_height
    )


def rectify_rgba(
    rgba: np.ndarray,
    quad: QuadTuple,
    width: int,
    height: int,
    *,
    interpolation: int = cv2.INTER_LINEAR,
) -> RectifiedImage:
    source = np.asarray(quad, dtype=np.float32)
    destination = np.asarray(
        ((0, 0), (width, 0), (width, height), (0, height)),
        dtype=np.float32,
    )
    forward = cv2.getPerspectiveTransform(source, destination)
    inverse = cv2.getPerspectiveTransform(destination, source)
    rectified = cv2.warpPerspective(
        rgba,
        forward,
        (width, height),
        flags=interpolation,
        borderMode=cv2.BORDER_REPLICATE,
    )
    return RectifiedImage(rgba=rectified, forward=forward, inverse=inverse)


def candidate_rectified_rgba(
    rgba: np.ndarray,
    quad: QuadTuple,
    width: int,
    height: int,
) -> np.ndarray:
    if is_exact_axis_aligned_quad(quad, width, height):
        left = round(quad[0][0])
        top = round(quad[0][1])
        return rgba[top : top + height, left : left + width].copy()
    return rectify_rgba(rgba, quad, width, height).rgba
