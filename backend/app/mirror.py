from __future__ import annotations

from PIL import Image

from app.errors import ApiError
from app.models import GridContract


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
    contract: GridContract, image_size: tuple[int, int]
) -> None:
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


def mirror_cells(source: Image.Image, contract: GridContract) -> Image.Image:
    result = source.copy()

    for row in range(contract.rows):
        top = contract.y_boundaries[row]
        bottom = contract.y_boundaries[row + 1]
        for source_column in range(contract.columns):
            left = contract.x_boundaries[source_column]
            right = contract.x_boundaries[source_column + 1]
            target_column = contract.columns - 1 - source_column
            target_left = contract.x_boundaries[target_column]
            source_cell = source.crop((left, top, right, bottom))
            result.paste(source_cell, (target_left, top))

    return result
