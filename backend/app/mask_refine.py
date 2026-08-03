"""交互式去背景蒙版精修：OpenCV GrabCut 边缘吸附。

模型给出的初始蒙版作为“可能前景/可能背景”，用户笔刷作为“确定前景/
确定背景”，GrabCut 图割在笔刷局部窗口内把选区边界吸附到真实颜色
边缘，避免手动涂抹造成毛糙边缘。
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

import cv2
import numpy as np

StrokeMode = Literal["keep", "remove"]

# GrabCut 工作窗口最长边；超出时先降采样再回放大，保证 CPU 响应时间。
_MAX_REFINE_WINDOW_EDGE = 1024
_GRABCUT_ITERATIONS = 3


@dataclass(frozen=True, slots=True)
class MaskStroke:
    mode: StrokeMode
    radius: int
    points: tuple[tuple[float, float], ...]


def refine_mask_with_strokes(
    image_rgb: np.ndarray,
    mask: np.ndarray,
    strokes: list[MaskStroke],
) -> np.ndarray:
    """按用户笔刷对初始蒙版做边缘吸附精修，返回 {0, 255} 二值蒙版。"""
    if image_rgb.ndim != 3 or image_rgb.shape[2] != 3:
        raise ValueError("image_rgb must be HxWx3")
    height, width = mask.shape
    if image_rgb.shape[0] != height or image_rgb.shape[1] != width:
        raise ValueError("image and mask dimensions differ")

    sure_keep = np.zeros((height, width), dtype=np.uint8)
    sure_remove = np.zeros((height, width), dtype=np.uint8)
    max_radius = 1
    for stroke in strokes:
        max_radius = max(max_radius, stroke.radius)
        target = sure_keep if stroke.mode == "keep" else sure_remove
        _rasterize_stroke(target, stroke)

    gc_mask = np.where(mask >= 128, cv2.GC_PR_FGD, cv2.GC_PR_BGD).astype(np.uint8)
    gc_mask[sure_keep > 0] = cv2.GC_FGD
    gc_mask[sure_remove > 0] = cv2.GC_BGD

    region = _stroke_window(sure_keep | sure_remove, max_radius, width, height)
    left, top, right, bottom = region
    window_image = np.ascontiguousarray(image_rgb[top:bottom, left:right])
    window_gc_mask = np.ascontiguousarray(gc_mask[top:bottom, left:right])

    has_foreground = bool(
        np.any((window_gc_mask == cv2.GC_FGD) | (window_gc_mask == cv2.GC_PR_FGD))
    )
    has_background = bool(
        np.any((window_gc_mask == cv2.GC_BGD) | (window_gc_mask == cv2.GC_PR_BGD))
    )
    if not has_foreground or not has_background:
        # 窗口内只有单一类别时 GrabCut 无法建模；直接按笔刷与当前蒙版定稿，
        # 保证“涂保留就保留、涂去除就去除”的顾客预期不被算法失败打断。
        refined_window = np.where(mask[top:bottom, left:right] >= 128, 255, 0).astype(
            np.uint8
        )
        refined_window[sure_keep[top:bottom, left:right] > 0] = 255
        refined_window[sure_remove[top:bottom, left:right] > 0] = 0
        refined = mask.copy()
        refined[top:bottom, left:right] = refined_window
        return refined

    scale = 1.0
    window_height, window_width = window_gc_mask.shape
    longest_edge = max(window_width, window_height)
    if longest_edge > _MAX_REFINE_WINDOW_EDGE:
        scale = _MAX_REFINE_WINDOW_EDGE / longest_edge
        resized_size = (
            max(1, round(window_width * scale)),
            max(1, round(window_height * scale)),
        )
        window_image = cv2.resize(
            window_image, resized_size, interpolation=cv2.INTER_AREA
        )
        window_gc_mask = cv2.resize(
            window_gc_mask, resized_size, interpolation=cv2.INTER_NEAREST
        )

    background_model = np.zeros((1, 65), dtype=np.float64)
    foreground_model = np.zeros((1, 65), dtype=np.float64)
    cv2.grabCut(
        window_image,
        window_gc_mask,
        None,
        background_model,
        foreground_model,
        _GRABCUT_ITERATIONS,
        cv2.GC_INIT_WITH_MASK,
    )
    refined_window = np.where(
        (window_gc_mask == cv2.GC_FGD) | (window_gc_mask == cv2.GC_PR_FGD),
        255,
        0,
    ).astype(np.uint8)

    if scale != 1.0:
        refined_window = cv2.resize(
            refined_window,
            (window_width, window_height),
            interpolation=cv2.INTER_LINEAR,
        )
        refined_window = np.where(refined_window >= 128, 255, 0).astype(np.uint8)

    refined = mask.copy()
    refined[top:bottom, left:right] = refined_window
    return refined


def apply_mask_to_rgba(image_rgba: np.ndarray, mask: np.ndarray) -> np.ndarray:
    """把二值/灰度蒙版作为 alpha 合成 RGBA 结果。"""
    if image_rgba.shape[:2] != mask.shape:
        raise ValueError("image and mask dimensions differ")
    result = image_rgba.copy()
    result[:, :, 3] = mask
    return result


def _rasterize_stroke(target: np.ndarray, stroke: MaskStroke) -> None:
    points = [
        (int(round(x)), int(round(y))) for x, y in stroke.points
    ]
    if not points:
        return
    thickness = max(1, stroke.radius * 2)
    if len(points) == 1:
        cv2.circle(target, points[0], stroke.radius, 255, -1)
        return
    cv2.polylines(
        target,
        [np.array(points, dtype=np.int32)],
        isClosed=False,
        color=255,
        thickness=thickness,
        lineType=cv2.LINE_8,
    )
    for point in points:
        cv2.circle(target, point, stroke.radius, 255, -1)


def _stroke_window(
    sure: np.ndarray,
    max_radius: int,
    width: int,
    height: int,
) -> tuple[int, int, int, int]:
    """笔刷像素的包围盒，向外扩边距后裁剪到图片范围。"""
    ys, xs = np.nonzero(sure)
    margin = max_radius * 2 + 64
    left = max(0, int(xs.min()) - margin)
    right = min(width, int(xs.max()) + margin + 1)
    top = max(0, int(ys.min()) - margin)
    bottom = min(height, int(ys.max()) + margin + 1)
    return left, top, right, bottom
