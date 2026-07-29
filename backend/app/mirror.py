from __future__ import annotations

import hmac

import cv2
import numpy as np
from PIL import Image

from app import limits
from app.chart_detection.authority import verify_candidate_id
from app.chart_detection.cells import extract_cell_records, summarize_cells
from app.chart_detection.geometry import (
    candidate_rectified_rgba,
    is_exact_axis_aligned_quad,
    rectify_rgba,
    validate_source_quad,
)
from app.chart_detection.types import QuadTuple
from app.errors import ApiError
from app.models import GridContract, GridContractV2


def _validate_axis(
    boundaries: list[int],
    *,
    expected_cells: int,
    cell_size: int,
    image_extent: int,
) -> None:
    if len(boundaries) != expected_cells + 1:
        raise ApiError(
            422,
            "GRID_BOUNDARY_COUNT_MISMATCH",
            "网格边界数量与行列合同不一致。",
        )

    if boundaries[0] < 0 or boundaries[-1] > image_extent:
        raise ApiError(
            422,
            "GRID_BOUNDARIES_OUT_OF_BOUNDS",
            "网格边界超出归一化图片范围。",
        )

    steps = [
        right - left for left, right in zip(boundaries, boundaries[1:])
    ]
    if any(step <= 0 for step in steps):
        raise ApiError(
            422,
            "GRID_BOUNDARIES_NOT_INCREASING",
            "网格边界必须为严格递增的整数坐标。",
        )

    if len(set(steps)) != 1:
        raise ApiError(
            422,
            "GRID_BOUNDARIES_NOT_EQUALLY_SPACED",
            "网格边界必须严格等距。",
        )

    detected_step = steps[0]
    if detected_step != cell_size:
        if cell_size % detected_step == 0 and cell_size > detected_step:
            raise ApiError(
                422,
                "GRID_HARMONIC_GUESS_REJECTED",
                "合同中的单元尺寸是边界步长的谐波倍数，已拒绝处理。",
            )
        raise ApiError(
            422,
            "GRID_CELL_SIZE_MISMATCH",
            "网格边界步长与单元尺寸不一致。",
        )

    if boundaries[-1] - boundaries[0] != expected_cells * cell_size:
        raise ApiError(
            422,
            "GRID_SPAN_MISMATCH",
            "网格跨度与单元尺寸及行列数量不一致。",
        )


def validate_grid_contract(
    contract: GridContract | GridContractV2,
    image_size: tuple[int, int],
) -> None:
    if isinstance(contract, GridContractV2):
        _validate_v2_grid_contract(contract, image_size)
        return

    if image_size != (contract.natural_width, contract.natural_height):
        raise ApiError(
            422,
            "GRID_IMAGE_STALE",
            "网格合同的图片尺寸已过期或与当前图片不一致。",
        )

    _validate_axis(
        contract.x_boundaries,
        expected_cells=contract.columns,
        cell_size=contract.cell_size,
        image_extent=contract.natural_width,
    )
    _validate_axis(
        contract.y_boundaries,
        expected_cells=contract.rows,
        cell_size=contract.cell_size,
        image_extent=contract.natural_height,
    )

    if contract.left is not None:
        if (
            contract.left != contract.x_boundaries[0]
            or contract.right != contract.x_boundaries[-1]
            or contract.top != contract.y_boundaries[0]
            or contract.bottom != contract.y_boundaries[-1]
        ):
            raise ApiError(
                422,
                "GRID_BOUNDS_MISMATCH",
                "网格边界数组与网格范围合同不一致。",
            )


def mirror_cells(
    source: Image.Image,
    contract: GridContract | GridContractV2,
) -> Image.Image:
    if isinstance(contract, GridContractV2):
        return _mirror_v2_cells(source, contract)

    result = source.copy()

    for row in range(contract.rows):
        top = contract.y_boundaries[row]
        bottom = contract.y_boundaries[row + 1]
        for source_column in range(contract.columns):
            left = contract.x_boundaries[source_column]
            right = contract.x_boundaries[source_column + 1]
            target_column = (
                contract.columns - 1 - source_column
                if contract.axis == "horizontal"
                else source_column
            )
            target_row = (
                contract.rows - 1 - row
                if contract.axis == "vertical"
                else row
            )
            target_left = contract.x_boundaries[target_column]
            target_top = contract.y_boundaries[target_row]
            source_cell = source.crop((left, top, right, bottom))
            result.paste(source_cell, (target_left, target_top))

    return result


def validate_v2_candidate_authority(
    source: Image.Image,
    contract: GridContractV2,
) -> None:
    quad = _contract_quad(contract)
    rgba = np.asarray(source.convert("RGBA"))
    rectified = candidate_rectified_rgba(
        rgba,
        quad,
        contract.rectified_width,
        contract.rectified_height,
    )
    records = extract_cell_records(
        rectified,
        contract.x_boundaries,
        contract.y_boundaries,
    )
    actual_digest = summarize_cells(records).matrix_digest
    if not hmac.compare_digest(actual_digest, contract.matrix_digest):
        raise ApiError(
            422,
            "GRID_CELL_MATRIX_MISMATCH",
            "当前图片的格位摘要与识别合同不一致，请重新识别。",
        )
    if not verify_candidate_id(
        contract.candidate_id,
        image_sha256=contract.image_sha256,
        natural_width=contract.natural_width,
        natural_height=contract.natural_height,
        source_quad=quad,
        rectified_width=contract.rectified_width,
        rectified_height=contract.rectified_height,
        pitch_x=contract.pitch_x,
        pitch_y=contract.pitch_y,
        columns=contract.columns,
        rows=contract.rows,
        x_boundaries=contract.x_boundaries,
        y_boundaries=contract.y_boundaries,
        matrix_digest=actual_digest,
    ):
        raise ApiError(
            422,
            "GRID_CANDIDATE_AUTHORITY_INVALID",
            "网格候选不是当前服务生成的有效合同，请重新识别。",
        )


def _validate_v2_grid_contract(
    contract: GridContractV2,
    image_size: tuple[int, int],
) -> None:
    if image_size != (contract.natural_width, contract.natural_height):
        raise ApiError(
            422,
            "GRID_IMAGE_STALE",
            "网格合同的图片尺寸已过期或与当前图片不一致。",
        )
    quad = _contract_quad(contract)
    validate_source_quad(quad, image_size)
    if (
        contract.rectified_width * contract.rectified_height
        > limits.MAX_DECODED_PIXELS
        or contract.rectified_width
        > max(8192, contract.natural_width * 4)
        or contract.rectified_height
        > max(8192, contract.natural_height * 4)
    ):
        raise ApiError(
            422,
            "GRID_RECTIFIED_SIZE_INVALID",
            "规范化网格尺寸超过安全处理范围。",
        )
    _validate_v2_axis(
        contract.x_boundaries,
        cells=contract.columns,
        extent=contract.rectified_width,
        pitch=contract.pitch_x,
    )
    _validate_v2_axis(
        contract.y_boundaries,
        cells=contract.rows,
        extent=contract.rectified_height,
        pitch=contract.pitch_y,
    )


def _validate_v2_axis(
    boundaries: list[int],
    *,
    cells: int,
    extent: int,
    pitch: float,
) -> None:
    if len(boundaries) != cells + 1:
        raise ApiError(
            422,
            "GRID_BOUNDARY_COUNT_MISMATCH",
            "规范化边界数量与行列数不一致。",
        )
    if boundaries[0] != 0 or boundaries[-1] != extent:
        raise ApiError(
            422,
            "GRID_SPAN_MISMATCH",
            "规范化边界必须完整覆盖网格平面。",
        )
    steps = [
        right - left for left, right in zip(boundaries, boundaries[1:])
    ]
    if any(step <= 0 for step in steps):
        raise ApiError(
            422,
            "GRID_BOUNDARIES_NOT_INCREASING",
            "规范化边界必须严格递增。",
        )
    if max(steps) - min(steps) > 1:
        raise ApiError(
            422,
            "GRID_BOUNDARIES_NOT_UNIFORM",
            "规范化格距的取整差不得超过一个像素。",
        )
    expected_pitch = extent / cells
    if abs(expected_pitch - pitch) > max(0.51, expected_pitch * 0.02):
        raise ApiError(
            422,
            "GRID_PITCH_MISMATCH",
            "规范化格距与网格跨度不一致。",
        )


def _mirror_v2_cells(
    source: Image.Image,
    contract: GridContractV2,
) -> Image.Image:
    quad = _contract_quad(contract)
    if _can_use_exact_path(contract, quad):
        return _mirror_v2_exact(source, contract, quad)
    return _mirror_v2_projective(source, contract, quad)


def _can_use_exact_path(
    contract: GridContractV2,
    quad: QuadTuple,
) -> bool:
    if not is_exact_axis_aligned_quad(
        quad,
        contract.rectified_width,
        contract.rectified_height,
    ):
        return False
    boundaries = (
        contract.x_boundaries
        if contract.axis == "horizontal"
        else contract.y_boundaries
    )
    steps = [
        right - left for left, right in zip(boundaries, boundaries[1:])
    ]
    return steps == list(reversed(steps))


def _mirror_v2_exact(
    source: Image.Image,
    contract: GridContractV2,
    quad: QuadTuple,
) -> Image.Image:
    result = source.copy()
    offset_x = round(quad[0][0])
    offset_y = round(quad[0][1])
    for row in range(contract.rows):
        source_top = offset_y + contract.y_boundaries[row]
        source_bottom = offset_y + contract.y_boundaries[row + 1]
        for column in range(contract.columns):
            source_left = offset_x + contract.x_boundaries[column]
            source_right = offset_x + contract.x_boundaries[column + 1]
            target_column = (
                contract.columns - 1 - column
                if contract.axis == "horizontal"
                else column
            )
            target_row = (
                contract.rows - 1 - row
                if contract.axis == "vertical"
                else row
            )
            target_left = offset_x + contract.x_boundaries[target_column]
            target_top = offset_y + contract.y_boundaries[target_row]
            patch = source.crop(
                (source_left, source_top, source_right, source_bottom)
            )
            result.paste(patch, (target_left, target_top))
    return result


def _mirror_v2_projective(
    source: Image.Image,
    contract: GridContractV2,
    quad: QuadTuple,
) -> Image.Image:
    source_rgba = np.asarray(source.convert("RGBA"))
    rectified = rectify_rgba(
        source_rgba,
        quad,
        contract.rectified_width,
        contract.rectified_height,
    )
    mirrored = _rearrange_rectified(rectified.rgba, contract)
    source_height, source_width = source_rgba.shape[:2]
    projected = cv2.warpPerspective(
        mirrored,
        rectified.inverse,
        (source_width, source_height),
        flags=cv2.INTER_LINEAR,
        borderMode=cv2.BORDER_CONSTANT,
        borderValue=(0, 0, 0, 0),
    )
    canonical_mask = np.full(
        (contract.rectified_height, contract.rectified_width),
        255,
        dtype=np.uint8,
    )
    mask = cv2.warpPerspective(
        canonical_mask,
        rectified.inverse,
        (source_width, source_height),
        flags=cv2.INTER_NEAREST,
        borderMode=cv2.BORDER_CONSTANT,
        borderValue=0,
    )
    result = source_rgba.copy()
    result[mask > 0] = projected[mask > 0]
    return Image.fromarray(result, mode="RGBA")


def _rearrange_rectified(
    source: np.ndarray,
    contract: GridContractV2,
) -> np.ndarray:
    result = source.copy()
    for row in range(contract.rows):
        top = contract.y_boundaries[row]
        bottom = contract.y_boundaries[row + 1]
        for column in range(contract.columns):
            left = contract.x_boundaries[column]
            right = contract.x_boundaries[column + 1]
            target_column = (
                contract.columns - 1 - column
                if contract.axis == "horizontal"
                else column
            )
            target_row = (
                contract.rows - 1 - row
                if contract.axis == "vertical"
                else row
            )
            target_left = contract.x_boundaries[target_column]
            target_right = contract.x_boundaries[target_column + 1]
            target_top = contract.y_boundaries[target_row]
            target_bottom = contract.y_boundaries[target_row + 1]
            patch = source[top:bottom, left:right]
            target_width = target_right - target_left
            target_height = target_bottom - target_top
            if patch.shape[:2] != (target_height, target_width):
                patch = cv2.resize(
                    patch,
                    (target_width, target_height),
                    interpolation=cv2.INTER_LINEAR,
                )
            result[
                target_top:target_bottom,
                target_left:target_right,
            ] = patch
    return result


def _contract_quad(contract: GridContractV2) -> QuadTuple:
    return tuple(
        (float(point.x), float(point.y))
        for point in contract.source_quad
    )  # type: ignore[return-value]
