"""交互式去背景的请求处理：初始蒙版、笔刷精修、蒙版应用。

沿用一键去背景的上传、像素、并发、内存处理与隐私合同；所有中间结果
只存在于内存，返回 PNG 字节。
"""

from __future__ import annotations

import json
from typing import Any

import numpy as np
from fastapi import UploadFile
from PIL import Image
from starlette.concurrency import run_in_threadpool

from app import limits
from app.background_removal import (
    BACKGROUND_REMOVAL_RUNTIME,
    _BACKGROUND_REMOVAL_SEMAPHORE,
    BackgroundRemovalUnavailableError,
)
from app.errors import ApiError
from app.mask_refine import MaskStroke, apply_mask_to_rgba, refine_mask_with_strokes
from app.service import decode_normalized_rgba, encode_png, read_upload

_MASK_PIXEL_ERROR_MESSAGE = "图片像素过多，无法安全执行一键去背景。请缩小图片后重试。"


async def create_background_mask_png(upload: UploadFile) -> bytes:
    """生成初始主体蒙版：255 = 保留（主体），0 = 去除（背景）。"""
    source: Image.Image | None = None
    mask: Image.Image | None = None
    try:
        image_bytes = await read_upload(upload)
        source = decode_normalized_rgba(
            image_bytes,
            upload.content_type or "",
            maximum_decoded_pixels=limits.MAX_BACKGROUND_REMOVAL_DECODED_PIXELS,
            pixel_error_code="BACKGROUND_REMOVAL_PIXEL_LIMIT_EXCEEDED",
            pixel_error_message=_MASK_PIXEL_ERROR_MESSAGE,
        )
        async with _BACKGROUND_REMOVAL_SEMAPHORE:
            mask = await run_in_threadpool(
                BACKGROUND_REMOVAL_RUNTIME.mask,
                source,
            )
        if mask.size != source.size:
            raise RuntimeError("background mask changed dimensions")
        return encode_png(mask)
    except ApiError:
        raise
    except BackgroundRemovalUnavailableError as error:
        raise ApiError(
            503,
            "BACKGROUND_REMOVAL_UNAVAILABLE",
            "一键去背景当前不可用。请联系服务维护者安装模型后重试。",
        ) from error
    except Exception as error:
        raise ApiError(
            500,
            "BACKGROUND_REMOVAL_FAILED",
            "无法识别图片主体。原图和当前图纸已保留，请稍后重试。",
        ) from error
    finally:
        if mask is not None:
            mask.close()
        if source is not None:
            source.close()
        await upload.close()


async def refine_background_mask_png(
    upload: UploadFile,
    mask_upload: UploadFile,
    strokes_text: str,
) -> bytes:
    """按用户笔刷对蒙版做 GrabCut 边缘吸附精修。"""
    source: Image.Image | None = None
    mask_image: Image.Image | None = None
    try:
        image_bytes = await read_upload(upload)
        mask_bytes = await read_upload(mask_upload)
        source = decode_normalized_rgba(
            image_bytes,
            upload.content_type or "",
            maximum_decoded_pixels=limits.MAX_BACKGROUND_REMOVAL_DECODED_PIXELS,
            pixel_error_code="BACKGROUND_REMOVAL_PIXEL_LIMIT_EXCEEDED",
            pixel_error_message=_MASK_PIXEL_ERROR_MESSAGE,
        )
        mask_image = _decode_mask_upload(
            mask_bytes,
            mask_upload.content_type or "",
            expected_size=source.size,
        )
        strokes = _parse_strokes(strokes_text, source.size)
        refined = await run_in_threadpool(
            _refine_in_worker,
            source,
            mask_image,
            strokes,
        )
        return encode_png(refined)
    except ApiError:
        raise
    except Exception as error:
        raise ApiError(
            500,
            "BACKGROUND_REMOVAL_REFINE_FAILED",
            "无法完成选区智能对齐。当前选区已保留，请稍后重试。",
        ) from error
    finally:
        if mask_image is not None:
            mask_image.close()
        if source is not None:
            source.close()
        await upload.close()
        await mask_upload.close()


async def apply_background_mask_png(
    upload: UploadFile,
    mask_upload: UploadFile,
) -> bytes:
    """把蒙版合成为最终 RGBA 去背景 PNG。"""
    source: Image.Image | None = None
    mask_image: Image.Image | None = None
    try:
        image_bytes = await read_upload(upload)
        mask_bytes = await read_upload(mask_upload)
        source = decode_normalized_rgba(
            image_bytes,
            upload.content_type or "",
            maximum_decoded_pixels=limits.MAX_BACKGROUND_REMOVAL_DECODED_PIXELS,
            pixel_error_code="BACKGROUND_REMOVAL_PIXEL_LIMIT_EXCEEDED",
            pixel_error_message=_MASK_PIXEL_ERROR_MESSAGE,
        )
        mask_image = _decode_mask_upload(
            mask_bytes,
            mask_upload.content_type or "",
            expected_size=source.size,
        )
        result = await run_in_threadpool(
            _apply_in_worker,
            source,
            mask_image,
        )
        try:
            return encode_png(result)
        finally:
            result.close()
    except ApiError:
        raise
    except Exception as error:
        raise ApiError(
            500,
            "BACKGROUND_REMOVAL_FAILED",
            "无法完成一键去背景。原图和当前图纸已保留，请稍后重试。",
        ) from error
    finally:
        if mask_image is not None:
            mask_image.close()
        if source is not None:
            source.close()
        await upload.close()
        await mask_upload.close()


def _refine_in_worker(
    source: Image.Image,
    mask_image: Image.Image,
    strokes: list[MaskStroke],
) -> Image.Image:
    image_rgb = np.asarray(source.convert("RGB"))
    mask = np.asarray(mask_image)
    refined = refine_mask_with_strokes(image_rgb, mask, strokes)
    return Image.fromarray(refined, mode="L")


def _apply_in_worker(
    source: Image.Image,
    mask_image: Image.Image,
) -> Image.Image:
    image_rgba = np.asarray(source)
    mask = np.asarray(mask_image)
    result = apply_mask_to_rgba(image_rgba, mask)
    return Image.fromarray(result, mode="RGBA")


def _decode_mask_upload(
    mask_bytes: bytes,
    declared_mime: str,
    *,
    expected_size: tuple[int, int],
) -> Image.Image:
    mask = decode_normalized_rgba(
        mask_bytes,
        declared_mime,
        maximum_decoded_pixels=limits.MAX_BACKGROUND_REMOVAL_DECODED_PIXELS,
        pixel_error_code="BACKGROUND_REMOVAL_PIXEL_LIMIT_EXCEEDED",
        pixel_error_message=_MASK_PIXEL_ERROR_MESSAGE,
    )
    if mask.size != expected_size:
        mask.close()
        raise ApiError(
            422,
            "BACKGROUND_REMOVAL_MASK_INVALID",
            "选区图片与当前图片尺寸不一致，请重新开始去背景。",
        )
    grayscale = mask.convert("L")
    mask.close()
    return grayscale


def _parse_strokes(
    strokes_text: str,
    image_size: tuple[int, int],
) -> list[MaskStroke]:
    width, height = image_size
    try:
        payload: Any = json.loads(strokes_text)
    except json.JSONDecodeError as error:
        raise _strokes_invalid() from error
    raw_strokes = payload.get("strokes") if isinstance(payload, dict) else None
    if (
        not isinstance(raw_strokes, list)
        or not 1 <= len(raw_strokes) <= limits.MAX_MASK_REFINE_STROKES
    ):
        raise _strokes_invalid()
    strokes: list[MaskStroke] = []
    total_points = 0
    for raw in raw_strokes:
        if not isinstance(raw, dict):
            raise _strokes_invalid()
        mode = raw.get("mode")
        radius = raw.get("radius")
        raw_points = raw.get("points")
        if mode not in ("keep", "remove"):
            raise _strokes_invalid()
        if (
            not isinstance(radius, int)
            or isinstance(radius, bool)
            or not limits.MIN_MASK_BRUSH_RADIUS_PX
            <= radius
            <= limits.MAX_MASK_BRUSH_RADIUS_PX
        ):
            raise _strokes_invalid()
        if not isinstance(raw_points, list) or not raw_points:
            raise _strokes_invalid()
        total_points += len(raw_points)
        if total_points > limits.MAX_MASK_REFINE_POINTS:
            raise _strokes_invalid()
        points: list[tuple[float, float]] = []
        for raw_point in raw_points:
            if (
                not isinstance(raw_point, list)
                or len(raw_point) != 2
                or not all(
                    isinstance(value, (int, float))
                    and not isinstance(value, bool)
                    for value in raw_point
                )
            ):
                raise _strokes_invalid()
            x = min(max(float(raw_point[0]), 0.0), float(width))
            y = min(max(float(raw_point[1]), 0.0), float(height))
            points.append((x, y))
        strokes.append(
            MaskStroke(mode=mode, radius=radius, points=tuple(points))
        )
    return strokes


def _strokes_invalid() -> ApiError:
    return ApiError(
        422,
        "BACKGROUND_REMOVAL_STROKES_INVALID",
        "涂抹选区数据无效，请重新开始去背景。",
    )
