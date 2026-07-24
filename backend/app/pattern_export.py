from __future__ import annotations

import csv
import io
import math
from dataclasses import dataclass

from PIL import Image, ImageDraw, ImageFont

from app import limits
from .generated_brand import PRODUCT_NAME
from app.errors import ApiError
from app.generated_design_tokens import EXPORT_COLORS
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
PDF_DPI = 150
PDF_PAGE_WIDTH_MM = 210.0
PDF_PAGE_HEIGHT_MM = 297.0
PDF_MARGIN_MM = 8.0
PDF_HEADER_MM = 25.0
PDF_FOOTER_MM = 8.0
PDF_LEGEND_WIDTH_MM = 42.0
PDF_COORDINATE_GUTTER_MM = 5.0


@dataclass(frozen=True)
class PdfSummary:
    revision: int
    rows: int
    columns: int
    non_empty_bead_count: int
    blank_count: int
    used_color_count: int
    width_mm: float
    height_mm: float
    bead_diameter_mm: float
    bead_pitch_mm: float
    board_rows: int
    board_columns: int
    board_layout_rows: int
    board_layout_columns: int
    per_color_counts: tuple[tuple[str, int], ...]


@dataclass(frozen=True)
class PdfBoardPage:
    board_id: str
    page_number: int
    row_start: int
    row_end: int
    column_start: int
    column_end: int
    scale: float
    width_mm: float
    height_mm: float
    non_empty_bead_count: int
    blank_count: int
    per_color_counts: tuple[tuple[str, int], ...]


@dataclass(frozen=True)
class PdfDocumentPlan:
    summary: PdfSummary
    boards: tuple[PdfBoardPage, ...]

    @property
    def page_count(self) -> int:
        return 1 + len(self.boards)


def create_pattern_export(
    request: PatternExportRequest,
) -> tuple[bytes, str, str]:
    if request.format == "csv":
        return (
            _render_csv(request.project),
            "text/csv; charset=utf-8",
            "pattern.csv",
        )
    if request.format == "png":
        image = _render_pattern_image(
            request.project,
            template=request.template,
        )
        output = io.BytesIO()
        image.save(output, format="PNG")
        return output.getvalue(), "image/png", "pattern.png"
    if request.format == "pdf":
        return (
            _render_pdf(request.project),
            "application/pdf",
            "pattern.pdf",
        )
    raise ApiError(422, "EXPORT_FORMAT_INVALID", "导出格式不受支持。")


def _render_pattern_image(
    project: BeadProject, *, template: str
) -> Image.Image:
    if template == "pure":
        return _render_pure_pattern_image(project)
    return _render_annotated_pattern_image(project)


def _render_pure_pattern_image(project: BeadProject) -> Image.Image:
    canvas = Image.new(
        "RGBA",
        (
            project.grid.columns * CELL_SIZE,
            project.grid.rows * CELL_SIZE,
        ),
        (0, 0, 0, 0),
    )
    draw = ImageDraw.Draw(canvas)
    for row_index, row in enumerate(project.cells):
        for column_index, cell in enumerate(row):
            if not isinstance(cell, FilledBeadCell):
                continue
            _draw_bead(
                draw,
                left=column_index * CELL_SIZE,
                top=row_index * CELL_SIZE,
                color_hex=COLOR_BY_ID[cell.color_id]["displayHex"],
                hole_fill=(0, 0, 0, 0),
            )
    return canvas


def _render_annotated_pattern_image(project: BeadProject) -> Image.Image:
    offset = LABEL_MARGIN
    width = offset + project.grid.columns * CELL_SIZE + LEGEND_WIDTH
    height = max(
        offset + project.grid.rows * CELL_SIZE,
        200 + _used_color_count(project) * 26,
    )
    canvas = Image.new("RGBA", (width, height), EXPORT_COLORS["background"])
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
            draw.rectangle(
                (left, top, right, bottom),
                outline=EXPORT_COLORS["grid"],
                width=1,
            )
            if isinstance(cell, FilledBeadCell):
                color = COLOR_BY_ID[cell.color_id]
                _draw_bead(
                    draw,
                    left=left,
                    top=top,
                    color_hex=color["displayHex"],
                    hole_fill=EXPORT_COLORS["background"],
                )

    for column in range(project.grid.columns):
        if column == 0 or (column + 1) % 5 == 0:
            draw.text(
                (
                    grid_left + column * CELL_SIZE + 7,
                    9,
                ),
                str(column + 1),
                fill=EXPORT_COLORS["textSecondary"],
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
                fill=EXPORT_COLORS["textSecondary"],
                font=font,
            )

    legend_left = offset + project.grid.columns * CELL_SIZE + 24
    statistics = _statistics(project)
    draw.text(
        (legend_left, 24),
        f"{project.grid.columns} x {project.grid.rows}",
        fill=EXPORT_COLORS["textPrimary"],
        font=font,
    )
    draw.text(
        (legend_left, 44),
        f"Beads: {statistics['nonEmptyBeadCount']}",
        fill=EXPORT_COLORS["textPrimary"],
        font=font,
    )
    draw.text(
        (legend_left, 64),
        f"Blank: {statistics['blankCount']}",
        fill=EXPORT_COLORS["textSecondary"],
        font=font,
    )
    draw.text(
        (legend_left, 84),
        f"Revision: {project.revision}",
        fill=EXPORT_COLORS["textSecondary"],
        font=font,
    )
    legend_top = 98
    for color_id, count in statistics["perColorCounts"].items():
        color = COLOR_BY_ID[color_id]
        draw.rectangle(
            (legend_left, legend_top, legend_left + 14, legend_top + 14),
            fill=color["displayHex"],
            outline=EXPORT_COLORS["beadOutline"],
        )
        label = f"{color['paletteId'].upper()} {color['code']}  {count}"
        draw.text(
            (legend_left + 22, legend_top + 2),
            label,
            fill=EXPORT_COLORS["textPrimary"],
            font=font,
        )
        legend_top += 26
    return canvas


def _draw_bead(
    draw: ImageDraw.ImageDraw,
    *,
    left: int,
    top: int,
    color_hex: str,
    hole_fill: str | tuple[int, int, int, int],
) -> None:
    right = left + CELL_SIZE
    bottom = top + CELL_SIZE
    padding = 3
    draw.ellipse(
        (
            left + padding,
            top + padding,
            right - padding,
            bottom - padding,
        ),
        fill=color_hex,
        outline=EXPORT_COLORS["beadOutline"],
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
        fill=hole_fill,
    )


def _plan_pdf_document(project: BeadProject) -> PdfDocumentPlan:
    board_layout_rows = math.ceil(
        project.grid.rows / project.grid.board_rows
    )
    board_layout_columns = math.ceil(
        project.grid.columns / project.grid.board_columns
    )
    _validate_pdf_export_budget(board_layout_rows, board_layout_columns)
    statistics = _statistics(project)
    scale = _pdf_board_scale(project)
    boards: list[PdfBoardPage] = []

    for board_row in range(board_layout_rows):
        row_start_index = board_row * project.grid.board_rows
        row_end_index = min(
            project.grid.rows,
            row_start_index + project.grid.board_rows,
        )
        for board_column in range(board_layout_columns):
            column_start_index = (
                board_column * project.grid.board_columns
            )
            column_end_index = min(
                project.grid.columns,
                column_start_index + project.grid.board_columns,
            )
            cells = [
                row[column_start_index:column_end_index]
                for row in project.cells[row_start_index:row_end_index]
            ]
            board_statistics = _statistics_for_cells(cells)
            board_row_count = row_end_index - row_start_index
            board_column_count = column_end_index - column_start_index
            boards.append(
                PdfBoardPage(
                    board_id=f"B{board_row + 1}-{board_column + 1}",
                    page_number=len(boards) + 2,
                    row_start=row_start_index + 1,
                    row_end=row_end_index,
                    column_start=column_start_index + 1,
                    column_end=column_end_index,
                    scale=scale,
                    width_mm=_physical_span_mm(
                        board_column_count,
                        project.grid.bead_pitch_mm,
                        project.grid.bead_diameter_mm,
                    ),
                    height_mm=_physical_span_mm(
                        board_row_count,
                        project.grid.bead_pitch_mm,
                        project.grid.bead_diameter_mm,
                    ),
                    non_empty_bead_count=int(
                        board_statistics["nonEmptyBeadCount"]
                    ),
                    blank_count=int(board_statistics["blankCount"]),
                    per_color_counts=tuple(
                        board_statistics["perColorCounts"].items()
                    ),
                )
            )

    summary = PdfSummary(
        revision=project.revision,
        rows=project.grid.rows,
        columns=project.grid.columns,
        non_empty_bead_count=int(statistics["nonEmptyBeadCount"]),
        blank_count=int(statistics["blankCount"]),
        used_color_count=len(statistics["perColorCounts"]),
        width_mm=_physical_span_mm(
            project.grid.columns,
            project.grid.bead_pitch_mm,
            project.grid.bead_diameter_mm,
        ),
        height_mm=_physical_span_mm(
            project.grid.rows,
            project.grid.bead_pitch_mm,
            project.grid.bead_diameter_mm,
        ),
        bead_diameter_mm=project.grid.bead_diameter_mm,
        bead_pitch_mm=project.grid.bead_pitch_mm,
        board_rows=project.grid.board_rows,
        board_columns=project.grid.board_columns,
        board_layout_rows=board_layout_rows,
        board_layout_columns=board_layout_columns,
        per_color_counts=tuple(statistics["perColorCounts"].items()),
    )
    return PdfDocumentPlan(summary=summary, boards=tuple(boards))


def _render_pdf(project: BeadProject) -> bytes:
    plan = _plan_pdf_document(project)
    output = io.BytesIO()
    summary_page = _render_pdf_summary_page(project, plan)
    try:
        summary_page.save(
            output,
            format="PDF",
            append=False,
            resolution=PDF_DPI,
            title=f"Pattern revision {project.revision}",
            subject=(
                f"{project.grid.columns} x {project.grid.rows}; "
                f"{plan.page_count} pages"
            ),
            creator=PRODUCT_NAME,
        )
    finally:
        summary_page.close()

    for board in plan.boards:
        page = _render_pdf_board_page(project, plan, board)
        try:
            page.save(
                output,
                format="PDF",
                append=True,
                resolution=PDF_DPI,
            )
        finally:
            page.close()
    return output.getvalue()


def _validate_pdf_export_budget(
    board_layout_rows: int,
    board_layout_columns: int,
) -> None:
    page_count = 1 + board_layout_rows * board_layout_columns
    page_raster_pixels = (
        _mm_to_px(PDF_PAGE_WIDTH_MM) * _mm_to_px(PDF_PAGE_HEIGHT_MM)
    )
    total_raster_pixels = page_count * page_raster_pixels
    if (
        page_count > limits.MAX_PDF_PAGES
        or total_raster_pixels > limits.MAX_PDF_RASTER_PIXELS
    ):
        raise ApiError(
            422,
            "PDF_EXPORT_LIMIT_EXCEEDED",
            (
                f"当前拼板布局需要 {page_count} 页，超出 PDF 导出预算。"
                f"最多 {limits.MAX_PDF_PAGES} 页且总渲染像素不得超过 "
                f"{limits.MAX_PDF_RASTER_PIXELS:,}；请改用更大的拼板规格后重试。"
            ),
        )


def _render_pdf_summary_page(
    project: BeadProject,
    plan: PdfDocumentPlan,
) -> Image.Image:
    page = _new_pdf_page()
    draw = ImageDraw.Draw(page)
    heading_font = ImageFont.load_default(size=20)
    body_font = ImageFont.load_default(size=13)
    summary = plan.summary
    left = _mm_to_px(PDF_MARGIN_MM)
    top = _mm_to_px(PDF_MARGIN_MM)

    draw.text(
        (left, top),
        "Pattern production summary",
        fill=EXPORT_COLORS["textPrimary"],
        font=heading_font,
    )
    details = (
        f"Revision: {summary.revision}",
        f"Matrix: {summary.columns} columns x {summary.rows} rows",
        (
            f"Counts: {summary.non_empty_bead_count} beads, "
            f"{summary.blank_count} blank, "
            f"{summary.used_color_count} colors"
        ),
        (
            f"Physical size: {summary.width_mm:.1f} x "
            f"{summary.height_mm:.1f} mm"
        ),
        (
            f"Bead diameter / pitch: "
            f"{summary.bead_diameter_mm:.1f} / "
            f"{summary.bead_pitch_mm:.1f} mm"
        ),
        (
            f"Board cells: {summary.board_columns} columns x "
            f"{summary.board_rows} rows"
        ),
        (
            f"Board layout: {summary.board_layout_columns} columns x "
            f"{summary.board_layout_rows} rows"
        ),
        f"Document pages: {plan.page_count}",
    )
    detail_top = top + 40
    for index, line in enumerate(details):
        draw.text(
            (left, detail_top + index * 22),
            line,
            fill=EXPORT_COLORS["textPrimary"],
            font=body_font,
        )

    legend_top = detail_top + len(details) * 22 + 20
    draw.text(
        (left, legend_top),
        "Global material legend",
        fill=EXPORT_COLORS["textPrimary"],
        font=heading_font,
    )
    _draw_pdf_legend(
        draw,
        summary.per_color_counts,
        (
            left,
            legend_top + 34,
            page.width - left,
            page.height - _mm_to_px(PDF_FOOTER_MM + 4),
        ),
        body_font,
        include_palette=True,
    )
    _draw_pdf_footer(draw, plan.page_count, 1, page.width, page.height)
    return page


def _render_pdf_board_page(
    project: BeadProject,
    plan: PdfDocumentPlan,
    board: PdfBoardPage,
) -> Image.Image:
    page = _new_pdf_page()
    draw = ImageDraw.Draw(page)
    heading_font = ImageFont.load_default(size=18)
    body_font = ImageFont.load_default(size=11)
    left = _mm_to_px(PDF_MARGIN_MM)
    top = _mm_to_px(PDF_MARGIN_MM)
    scale_label = (
        "1:1"
        if math.isclose(board.scale, 1.0)
        else f"{board.scale * 100:.1f}%"
    )

    draw.text(
        (left, top),
        (
            f"Board {board.board_id} | rows {board.row_start}-"
            f"{board.row_end} | columns {board.column_start}-"
            f"{board.column_end}"
        ),
        fill=EXPORT_COLORS["textPrimary"],
        font=heading_font,
    )
    draw.text(
        (left, top + 28),
        (
            f"Revision {project.revision} | page {board.page_number}/"
            f"{plan.page_count} | print scale {scale_label}"
        ),
        fill=EXPORT_COLORS["textSecondary"],
        font=body_font,
    )
    draw.text(
        (left, top + 46),
        (
            f"Board size {board.width_mm:.1f} x {board.height_mm:.1f} mm "
            f"| pitch {project.grid.bead_pitch_mm:.1f} mm | "
            f"{board.non_empty_bead_count} beads, "
            f"{board.blank_count} blank"
        ),
        fill=EXPORT_COLORS["textSecondary"],
        font=body_font,
    )

    _draw_pdf_board_pattern(draw, project, board, body_font)
    legend_left = page.width - _mm_to_px(
        PDF_MARGIN_MM + PDF_LEGEND_WIDTH_MM
    )
    legend_top = _mm_to_px(PDF_MARGIN_MM + PDF_HEADER_MM)
    draw.text(
        (legend_left, legend_top),
        f"{project.palette.palette_id.upper()} board legend",
        fill=EXPORT_COLORS["textPrimary"],
        font=heading_font,
    )
    _draw_pdf_legend(
        draw,
        board.per_color_counts,
        (
            legend_left,
            legend_top + 30,
            page.width - _mm_to_px(PDF_MARGIN_MM),
            page.height - _mm_to_px(PDF_FOOTER_MM + PDF_MARGIN_MM),
        ),
        body_font,
        include_palette=False,
    )
    _draw_pdf_footer(
        draw,
        plan.page_count,
        board.page_number,
        page.width,
        page.height,
    )
    return page


def _draw_pdf_board_pattern(
    draw: ImageDraw.ImageDraw,
    project: BeadProject,
    board: PdfBoardPage,
    font: ImageFont.ImageFont,
) -> None:
    pixels_per_mm = PDF_DPI / 25.4 * board.scale
    bead_diameter = project.grid.bead_diameter_mm * pixels_per_mm
    pitch = project.grid.bead_pitch_mm * pixels_per_mm
    coordinate_gutter = _mm_to_px(PDF_COORDINATE_GUTTER_MM)
    origin_x = _mm_to_px(PDF_MARGIN_MM) + coordinate_gutter
    origin_y = _mm_to_px(
        PDF_MARGIN_MM + PDF_HEADER_MM + PDF_COORDINATE_GUTTER_MM
    )
    rows = board.row_end - board.row_start + 1
    columns = board.column_end - board.column_start + 1

    for local_row in range(rows):
        center_y = origin_y + bead_diameter / 2 + local_row * pitch
        for local_column in range(columns):
            center_x = (
                origin_x + bead_diameter / 2 + local_column * pitch
            )
            left = center_x - (
                bead_diameter / 2 if local_column == 0 else pitch / 2
            )
            right = center_x + (
                bead_diameter / 2
                if local_column == columns - 1
                else pitch / 2
            )
            top = center_y - (
                bead_diameter / 2 if local_row == 0 else pitch / 2
            )
            bottom = center_y + (
                bead_diameter / 2
                if local_row == rows - 1
                else pitch / 2
            )
            draw.rectangle(
                tuple(round(value) for value in (left, top, right, bottom)),
                outline=EXPORT_COLORS["grid"],
                width=1,
            )
            cell = project.cells[
                board.row_start - 1 + local_row
            ][board.column_start - 1 + local_column]
            if isinstance(cell, FilledBeadCell):
                radius = bead_diameter / 2
                color = COLOR_BY_ID[cell.color_id]
                draw.ellipse(
                    tuple(
                        round(value)
                        for value in (
                            center_x - radius,
                            center_y - radius,
                            center_x + radius,
                            center_y + radius,
                        )
                    ),
                    fill=color["displayHex"],
                    outline=EXPORT_COLORS["beadOutline"],
                    width=1,
                )
                hole_radius = max(1, round(bead_diameter * 0.1))
                draw.ellipse(
                    (
                        round(center_x) - hole_radius,
                        round(center_y) - hole_radius,
                        round(center_x) + hole_radius,
                        round(center_y) + hole_radius,
                    ),
                    fill=EXPORT_COLORS["background"],
                )

    for local_column in range(columns):
        if _should_label_coordinate(local_column, columns, pitch):
            draw.text(
                (
                    round(
                        origin_x
                        + bead_diameter / 2
                        + local_column * pitch
                    ),
                    origin_y - coordinate_gutter,
                ),
                str(board.column_start + local_column),
                anchor="ma",
                fill=EXPORT_COLORS["textSecondary"],
                font=font,
            )
    for local_row in range(rows):
        if _should_label_coordinate(local_row, rows, pitch):
            draw.text(
                (
                    origin_x - 4,
                    round(
                        origin_y
                        + bead_diameter / 2
                        + local_row * pitch
                    ),
                ),
                str(board.row_start + local_row),
                anchor="rm",
                fill=EXPORT_COLORS["textSecondary"],
                font=font,
            )


def _draw_pdf_legend(
    draw: ImageDraw.ImageDraw,
    counts: tuple[tuple[str, int], ...],
    box: tuple[int, int, int, int],
    font: ImageFont.ImageFont,
    *,
    include_palette: bool,
) -> None:
    left, top, right, bottom = box
    if not counts:
        draw.text(
            (left, top),
            "No bead colors",
            fill=EXPORT_COLORS["textSecondary"],
            font=font,
        )
        return
    row_height = max(14, int(getattr(font, "size", 11)) + 4)
    rows_per_column = max(1, (bottom - top) // row_height)
    column_count = math.ceil(len(counts) / rows_per_column)
    column_width = max(1, (right - left) // column_count)
    swatch_size = min(10, row_height - 3)
    for index, (color_id, count) in enumerate(counts):
        column = index // rows_per_column
        row = index % rows_per_column
        x = left + column * column_width
        y = top + row * row_height
        color = COLOR_BY_ID[color_id]
        draw.rectangle(
            (x, y, x + swatch_size, y + swatch_size),
            fill=color["displayHex"],
            outline=EXPORT_COLORS["beadOutline"],
        )
        prefix = (
            f"{color['paletteId'].upper()} {color['code']}"
            if include_palette
            else color["code"]
        )
        draw.text(
            (x + swatch_size + 4, y),
            f"{prefix}  {count}",
            fill=EXPORT_COLORS["textPrimary"],
            font=font,
        )


def _draw_pdf_footer(
    draw: ImageDraw.ImageDraw,
    page_count: int,
    page_number: int,
    page_width: int,
    page_height: int,
) -> None:
    font = ImageFont.load_default(size=11)
    draw.text(
        (
            page_width - _mm_to_px(PDF_MARGIN_MM),
            page_height - _mm_to_px(PDF_MARGIN_MM),
        ),
        f"Page {page_number}/{page_count}",
        anchor="rs",
        fill=EXPORT_COLORS["textSecondary"],
        font=font,
    )


def _new_pdf_page() -> Image.Image:
    return Image.new(
        "RGB",
        (
            _mm_to_px(PDF_PAGE_WIDTH_MM),
            _mm_to_px(PDF_PAGE_HEIGHT_MM),
        ),
        EXPORT_COLORS["background"],
    )


def _pdf_board_scale(project: BeadProject) -> float:
    physical_width = _physical_span_mm(
        project.grid.board_columns,
        project.grid.bead_pitch_mm,
        project.grid.bead_diameter_mm,
    )
    physical_height = _physical_span_mm(
        project.grid.board_rows,
        project.grid.bead_pitch_mm,
        project.grid.bead_diameter_mm,
    )
    available_width = (
        PDF_PAGE_WIDTH_MM
        - 2 * PDF_MARGIN_MM
        - PDF_LEGEND_WIDTH_MM
        - PDF_COORDINATE_GUTTER_MM
    )
    available_height = (
        PDF_PAGE_HEIGHT_MM
        - 2 * PDF_MARGIN_MM
        - PDF_HEADER_MM
        - PDF_FOOTER_MM
        - PDF_COORDINATE_GUTTER_MM
    )
    return min(
        1.0,
        available_width / physical_width,
        available_height / physical_height,
    )


def _physical_span_mm(
    cell_count: int,
    pitch_mm: float,
    diameter_mm: float,
) -> float:
    return (cell_count - 1) * pitch_mm + diameter_mm


def _mm_to_px(value_mm: float) -> int:
    return round(value_mm * PDF_DPI / 25.4)


def _should_label_coordinate(
    index: int,
    count: int,
    pitch_pixels: float,
) -> bool:
    return (
        pitch_pixels >= 18
        or index == 0
        or index == count - 1
        or (index + 1) % 5 == 0
    )


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
    writer.writerows(
        [
            [],
            ["逐格明细"],
            ["行", "列", "类型", "颜色 ID", "色板", "系列", "色号"],
        ]
    )
    for row_index, row in enumerate(project.cells, start=1):
        for column_index, cell in enumerate(row, start=1):
            color = (
                COLOR_BY_ID[cell.color_id]
                if isinstance(cell, FilledBeadCell)
                else None
            )
            writer.writerow(
                [
                    row_index,
                    column_index,
                    "拼豆" if isinstance(cell, FilledBeadCell) else "空",
                    color["id"] if color else "",
                    color["paletteId"] if color else "",
                    color["series"] if color else "",
                    color["code"] if color else "",
                ]
            )
    return ("\ufeff" + output.getvalue()).encode("utf-8")


def _statistics(project: BeadProject) -> dict[str, object]:
    statistics = _statistics_for_cells(project.cells)
    expected_total = project.grid.rows * project.grid.columns
    if statistics["totalCellCount"] != expected_total:
        raise ApiError(
            422,
            "PROJECT_STATISTICS_INVALID",
            "项目矩阵与材料数量不一致，无法导出。",
        )
    return statistics


def _statistics_for_cells(
    cells: list[list[object]] | tuple[tuple[object, ...], ...],
) -> dict[str, object]:
    counts: dict[str, int] = {}
    blank_count = 0
    total = 0
    for row in cells:
        total += len(row)
        for cell in row:
            if isinstance(cell, FilledBeadCell):
                counts[cell.color_id] = counts.get(cell.color_id, 0) + 1
            else:
                blank_count += 1
    non_empty = sum(counts.values())
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
