from __future__ import annotations

import csv
import io
import math

from PIL import Image, ImageDraw, ImageFont

from .generated_brand import PRODUCT_NAME
from app.errors import ApiError
from app.generated_palettes import PALETTE_COLORS
from app.models import (
    BeadProject,
    FilledBeadCell,
    PatternExportRequest,
)

COLOR_BY_ID = {color["id"]: color for color in PALETTE_COLORS}
CELL_SIZE = 24
LABEL_MARGIN = 32
LEGEND_WIDTH = 220


def create_pattern_export(
    request: PatternExportRequest,
) -> tuple[bytes, str, str]:
    if request.format == "csv":
        return (
            _render_csv(request.project),
            "text/csv; charset=utf-8",
            "pattern.csv",
        )
    image = _render_pattern_image(
        request.project, include_grid=request.include_grid
    )
    if request.format == "png":
        output = io.BytesIO()
        image.save(output, format="PNG")
        return output.getvalue(), "image/png", "pattern.png"
    if request.format == "pdf":
        output = io.BytesIO()
        image.convert("RGB").save(output, format="PDF", resolution=150)
        return output.getvalue(), "application/pdf", "pattern.pdf"
    raise ApiError(422, "EXPORT_FORMAT_INVALID", "导出格式不受支持。")


def _render_pattern_image(
    project: BeadProject, *, include_grid: bool
) -> Image.Image:
    offset = LABEL_MARGIN if include_grid else 0
    width = offset + project.grid.columns * CELL_SIZE + LEGEND_WIDTH
    height = max(
        offset + project.grid.rows * CELL_SIZE,
        180 + _used_color_count(project) * 26,
    )
    canvas = Image.new("RGBA", (width, height), "#FBFAF6")
    draw = ImageDraw.Draw(canvas)
    font = ImageFont.load_default()
    grid_left = offset
    grid_top = offset

    for row_index, row in enumerate(project.cells):
        for column_index, cell in enumerate(row):
            left = grid_left + column_index * CELL_SIZE
            top = grid_top + row_index * CELL_SIZE
            right = left + CELL_SIZE
            bottom = top + CELL_SIZE
            if include_grid:
                draw.rectangle(
                    (left, top, right, bottom),
                    outline="#D7D2C8",
                    width=1,
                )
            if isinstance(cell, FilledBeadCell):
                color = COLOR_BY_ID[cell.color_id]
                padding = 3
                draw.ellipse(
                    (
                        left + padding,
                        top + padding,
                        right - padding,
                        bottom - padding,
                    ),
                    fill=color["displayHex"],
                    outline="#6A6A62",
                    width=1,
                )
                hole_radius = 2
                center_x = (left + right) // 2
                center_y = (top + bottom) // 2
                draw.ellipse(
                    (
                        center_x - hole_radius,
                        center_y - hole_radius,
                        center_x + hole_radius,
                        center_y + hole_radius,
                    ),
                    fill="#FBFAF6",
                )

    if include_grid:
        for column in range(project.grid.columns):
            if column == 0 or (column + 1) % 5 == 0:
                draw.text(
                    (
                        grid_left + column * CELL_SIZE + 7,
                        9,
                    ),
                    str(column + 1),
                    fill="#65706C",
                    font=font,
                )
        for row in range(project.grid.rows):
            if row == 0 or (row + 1) % 5 == 0:
                draw.text(
                    (
                        7,
                        grid_top + row * CELL_SIZE + 7,
                    ),
                    str(row + 1),
                    fill="#65706C",
                    font=font,
                )

    legend_left = offset + project.grid.columns * CELL_SIZE + 24
    statistics = _statistics(project)
    draw.text(
        (legend_left, 24),
        f"{project.grid.columns} x {project.grid.rows}",
        fill="#1D2523",
        font=font,
    )
    draw.text(
        (legend_left, 44),
        f"Beads: {statistics['nonEmptyBeadCount']}",
        fill="#1D2523",
        font=font,
    )
    draw.text(
        (legend_left, 64),
        f"Blank: {statistics['blankCount']}",
        fill="#65706C",
        font=font,
    )
    legend_top = 98
    for color_id, count in statistics["perColorCounts"].items():
        color = COLOR_BY_ID[color_id]
        draw.rectangle(
            (legend_left, legend_top, legend_left + 14, legend_top + 14),
            fill=color["displayHex"],
            outline="#6A6A62",
        )
        label = f"{color['paletteId'].upper()} {color['code']}  {count}"
        draw.text(
            (legend_left + 22, legend_top + 2),
            label,
            fill="#1D2523",
            font=font,
        )
        legend_top += 26
    return canvas


def _render_csv(project: BeadProject) -> bytes:
    output = io.StringIO(newline="")
    writer = csv.writer(output)
    statistics = _statistics(project)
    writer.writerows(
        [
            [f"{PRODUCT_NAME}项目", project.id],
            ["项目版本", project.schema_version],
            ["矩阵版本", project.revision],
            ["行", project.grid.rows],
            ["列", project.grid.columns],
            ["拼豆总数", statistics["nonEmptyBeadCount"]],
            ["空格数", statistics["blankCount"]],
            [],
            ["材料清单"],
            [
                "颜色 ID",
                "色板",
                "系列",
                "色号",
                "显示 HEX",
                "名称",
                "数量",
            ],
        ]
    )
    for color_id, count in statistics["perColorCounts"].items():
        color = COLOR_BY_ID[color_id]
        writer.writerow(
            [
                color["id"],
                color["paletteId"],
                color["series"],
                color["code"],
                color["displayHex"],
                color["name"] or "",
                count,
            ]
        )
    writer.writerows([[], ["逐格明细"], ["行", "列", "类型", "颜色 ID"]])
    for row_index, row in enumerate(project.cells, start=1):
        for column_index, cell in enumerate(row, start=1):
            writer.writerow(
                [
                    row_index,
                    column_index,
                    "拼豆" if isinstance(cell, FilledBeadCell) else "空",
                    cell.color_id
                    if isinstance(cell, FilledBeadCell)
                    else "",
                ]
            )
    return ("\ufeff" + output.getvalue()).encode("utf-8")


def _statistics(project: BeadProject) -> dict[str, object]:
    counts: dict[str, int] = {}
    blank_count = 0
    for row in project.cells:
        for cell in row:
            if isinstance(cell, FilledBeadCell):
                counts[cell.color_id] = counts.get(cell.color_id, 0) + 1
            else:
                blank_count += 1
    non_empty = sum(counts.values())
    total = project.grid.rows * project.grid.columns
    if non_empty + blank_count != total:
        raise ApiError(
            422,
            "PROJECT_STATISTICS_INVALID",
            "项目矩阵与材料数量不一致，无法导出。",
        )
    return {
        "totalCellCount": total,
        "blankCount": blank_count,
        "nonEmptyBeadCount": non_empty,
        "perColorCounts": dict(sorted(counts.items())),
    }


def _used_color_count(project: BeadProject) -> int:
    return len(
        {
            cell.color_id
            for row in project.cells
            for cell in row
            if isinstance(cell, FilledBeadCell)
        }
    )
