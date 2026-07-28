from __future__ import annotations

import csv
import io
import math
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

from app import limits
from app.errors import ApiError
from app.generated_brand import PRODUCT_NAME
from app.generated_design_tokens import EXPORT_COLORS
from app.generated_palettes import PALETTE_COLORS, PALETTES
from app.models import (
    BeadProject,
    FilledBeadCell,
    PatternExportRequest,
)

COLOR_BY_ID = {color["id"]: color for color in PALETTE_COLORS}
PALETTE_LABEL_BY_ID = {
    palette["id"]: palette["label"] for palette in PALETTES
}
CELL_SIZE = 24
LABEL_MARGIN = 76
LEGEND_WIDTH = 320
NUMBERED_HEADER_HEIGHT = 88
NUMBERED_OUTER_MARGIN = 24
NUMBERED_COORDINATE_GUTTER = 28
NUMBERED_SECTION_GAP = 28
NUMBERED_LEGEND_TITLE_HEIGHT = 64
NUMBERED_LEGEND_ROW_HEIGHT = 90
NUMBERED_TOTAL_HEIGHT = 72
NUMBERED_MIN_WIDTH = 760
NUMBERED_LEGEND_MIN_COLUMN_WIDTH = 220
NUMBERED_MAX_LEGEND_COLUMNS = 4
NUMBERED_MIN_CELL_SIZE = 18
NUMBERED_MAX_CELL_SIZE = 44
NUMBERED_MAX_GRID_SPAN = 4400
ROUNDED_CELL_PITCH = 16
ROUNDED_CELL_INSET = 1
ROUNDED_CELL_RADIUS = 3
PDF_DPI = 150
PDF_SUMMARY_HEADING_FONT_SIZE = 32
PDF_SUMMARY_BODY_FONT_SIZE = 20
PDF_BOARD_HEADING_FONT_SIZE = 26
PDF_BOARD_BODY_FONT_SIZE = 17
PDF_COORDINATE_FONT_SIZE = 14
PDF_PAGE_WIDTH_MM = 210.0
PDF_PAGE_HEIGHT_MM = 297.0
PDF_MARGIN_MM = 8.0
PDF_HEADER_MM = 25.0
PDF_FOOTER_MM = 8.0
PDF_LEGEND_WIDTH_MM = 42.0
PDF_COORDINATE_GUTTER_MM = 10.0
PDF_LEGEND_SWATCH_SIZE = 10
PDF_LEGEND_TEXT_GAP = 4
PDF_LEGEND_COLUMN_GAP = 12
PDF_LEGEND_ROW_GAP = 4
PDF_SUMMARY_LEGEND_DESCRIPTION_OFFSET = 42
PDF_SUMMARY_LEGEND_ITEMS_OFFSET = 70
PDF_BOARD_LEGEND_DESCRIPTION_OFFSET = 38
PDF_BOARD_LEGEND_ITEMS_OFFSET = 64
COORDINATE_LABEL_GAP = 4


@dataclass(frozen=True)
class CjkFontCandidate:
    path: str
    face_index: int


_CJK_FONT_CANDIDATES = (
    CjkFontCandidate("/System/Library/Fonts/STHeiti Light.ttc", 1),
    CjkFontCandidate("/System/Library/Fonts/STHeiti Medium.ttc", 1),
    CjkFontCandidate(
        "/System/Library/Fonts/Supplemental/Arial Unicode.ttf",
        0,
    ),
    CjkFontCandidate("/Library/Fonts/Arial Unicode.ttf", 0),
    CjkFontCandidate(
        "/usr/share/fonts/opentype/noto/NotoSansCJKsc-Regular.otf",
        0,
    ),
    CjkFontCandidate(
        "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
        2,
    ),
)


@dataclass(frozen=True)
class AnnotatedPngText:
    title: str
    dimensions: str
    bead_count: str
    blank_count: str
    color_count: str
    legend_heading: str
    column_labels: tuple[str, ...]
    row_labels: tuple[str, ...]
    legend_lines: tuple[str, ...]

    @property
    def lines(self) -> tuple[str, ...]:
        return (
            self.title,
            self.dimensions,
            self.bead_count,
            self.blank_count,
            self.color_count,
            self.legend_heading,
            *self.column_labels,
            *self.row_labels,
            *self.legend_lines,
        )


@dataclass(frozen=True)
class NumberedPngText:
    title: str
    summary: str
    palette: str
    legend_heading: str
    cell_codes: tuple[tuple[str, ...], ...]
    legend_lines: tuple[str, ...]
    total: str

    @property
    def lines(self) -> tuple[str, ...]:
        return (
            self.title,
            self.summary,
            self.palette,
            self.legend_heading,
            *(code for row in self.cell_codes for code in row if code),
            *self.legend_lines,
            self.total,
        )


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
    board_row: int
    board_column: int
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
    legend_width_mm: float


@dataclass(frozen=True)
class _PdfBoardDraft:
    board_id: str
    board_row: int
    board_column: int
    row_start: int
    row_end: int
    column_start: int
    column_end: int
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


@dataclass(frozen=True)
class PdfSummaryText:
    title: str
    details: tuple[str, ...]
    legend_heading: str
    legend_columns: str
    legend_lines: tuple[str, ...]
    footer: str

    @property
    def lines(self) -> tuple[str, ...]:
        return (
            self.title,
            *self.details,
            self.legend_heading,
            self.legend_columns,
            *self.legend_lines,
            self.footer,
        )


@dataclass(frozen=True)
class PdfBoardText:
    heading: str
    page_and_scale: str
    dimensions_and_counts: str
    legend_heading: str
    legend_columns: str
    legend_lines: tuple[str, ...]
    footer: str

    @property
    def lines(self) -> tuple[str, ...]:
        return (
            self.heading,
            self.page_and_scale,
            self.dimensions_and_counts,
            self.legend_heading,
            self.legend_columns,
            *self.legend_lines,
            self.footer,
        )


@dataclass(frozen=True)
class PdfLegendItemLayout:
    color_id: str
    count: int
    label: str
    swatch_box: tuple[int, int, int, int]
    text_position: tuple[int, int]


@dataclass(frozen=True)
class PdfLegendLayout:
    items: tuple[PdfLegendItemLayout, ...]
    required_width: int
    required_height: int
    column_count: int
    rows_per_column: int


@dataclass(frozen=True)
class CoordinateLabelPlacement:
    axis: str
    index: int
    label: str
    position: tuple[float, float]
    anchor: str


@dataclass(frozen=True)
class _CoordinateLabelCandidate:
    axis: str
    index: int
    label: str
    positions: tuple[tuple[float, float], ...]
    anchor: str
    boundary: bool


@dataclass(frozen=True)
class _PdfLegendMeasurement:
    entries: tuple[tuple[str, int, str, int, int], ...]
    column_widths: tuple[int, ...]
    required_width: int
    required_height: int
    row_height: int
    rows_per_column: int


@lru_cache(maxsize=1)
def _resolve_cjk_font_path() -> CjkFontCandidate:
    for candidate in _CJK_FONT_CANDIDATES:
        path = Path(candidate.path)
        if not path.is_file():
            continue
        try:
            ImageFont.truetype(
                str(path),
                size=12,
                index=candidate.face_index,
            )
        except OSError:
            continue
        return candidate
    raise ApiError(
        500,
        "EXPORT_CJK_FONT_UNAVAILABLE",
        "未找到可用的中文字体，无法生成带文字的导出文件。",
    )


def _load_cjk_font(size: int) -> ImageFont.FreeTypeFont:
    candidate = _resolve_cjk_font_path()
    try:
        return ImageFont.truetype(
            candidate.path,
            size=size,
            index=candidate.face_index,
        )
    except OSError as error:
        raise ApiError(
            500,
            "EXPORT_CJK_FONT_UNAVAILABLE",
            "未找到可用的中文字体，无法生成带文字的导出文件。",
        ) from error


def _palette_label(palette_id: str) -> str:
    label = PALETTE_LABEL_BY_ID.get(palette_id)
    if label is None:
        raise ApiError(
            422,
            "PROJECT_PALETTE_INVALID",
            "项目包含当前应用无法识别的色板。",
        )
    return label


def _column_coordinate_label(column: int) -> str:
    return f"第{column}列"


def _row_coordinate_label(row: int) -> str:
    return f"第{row}行"


def _material_legend_label(
    color_id: str,
    count: int,
    *,
    include_palette: bool,
) -> str:
    color = COLOR_BY_ID[color_id]
    parts = []
    if include_palette:
        parts.append(_palette_label(color["paletteId"]))
    parts.extend(
        (
            f"{color['series']} 系列",
            f"色号 {color['code']}",
            f"{count} 颗",
        )
    )
    return " · ".join(parts)


def _pdf_material_legend_label(
    color_id: str,
    count: int,
    *,
    include_palette: bool,
) -> str:
    color = COLOR_BY_ID[color_id]
    parts = []
    if include_palette:
        parts.append(_palette_label(color["paletteId"]))
    parts.extend(
        (
            str(color["series"]),
            str(color["code"]),
            str(count),
        )
    )
    return "｜".join(parts)


def _should_label_png_coordinate(index: int, count: int) -> bool:
    return (
        index == 0
        or index == count - 1
        or (index + 1) % 5 == 0
    )


def _annotated_png_text(project: BeadProject) -> AnnotatedPngText:
    statistics = _statistics(project)
    return AnnotatedPngText(
        title=f"{PRODUCT_NAME}图纸",
        dimensions=(
            f"图案：{project.grid.columns} 列 × "
            f"{project.grid.rows} 行"
        ),
        bead_count=f"拼豆总数：{statistics['nonEmptyBeadCount']} 颗",
        blank_count=f"空格数：{statistics['blankCount']} 个",
        color_count=(
            f"使用颜色：{len(statistics['perColorCounts'])} 种"
        ),
        legend_heading="材料清单",
        column_labels=tuple(
            _column_coordinate_label(column + 1)
            for column in range(project.grid.columns)
            if _should_label_png_coordinate(
                column,
                project.grid.columns,
            )
        ),
        row_labels=tuple(
            _row_coordinate_label(row + 1)
            for row in range(project.grid.rows)
            if _should_label_png_coordinate(row, project.grid.rows)
        ),
        legend_lines=tuple(
            _material_legend_label(
                color_id,
                int(count),
                include_palette=True,
            )
            for color_id, count in statistics["perColorCounts"].items()
        ),
    )


def _numbered_png_text(project: BeadProject) -> NumberedPngText:
    statistics = _statistics(project)
    return NumberedPngText(
        title=f"{PRODUCT_NAME} · 色号图纸",
        summary=(
            f"{project.grid.columns} 列 × {project.grid.rows} 行"
            f"｜{statistics['nonEmptyBeadCount']} 颗"
            f"｜{len(statistics['perColorCounts'])} 色"
        ),
        palette=f"{_palette_label(project.palette.palette_id)} 色板",
        legend_heading="材料清单",
        cell_codes=tuple(
            tuple(
                (
                    str(COLOR_BY_ID[cell.color_id]["code"])
                    if isinstance(cell, FilledBeadCell)
                    else ""
                )
                for cell in row
            )
            for row in project.cells
        ),
        legend_lines=tuple(
            (
                f"{COLOR_BY_ID[color_id]['code']}"
                f"｜{count} 颗"
            )
            for color_id, count in statistics["perColorCounts"].items()
        ),
        total=f"总计：{statistics['nonEmptyBeadCount']} 颗",
    )


def _pdf_summary_text(plan: PdfDocumentPlan) -> PdfSummaryText:
    summary = plan.summary
    return PdfSummaryText(
        title=f"{PRODUCT_NAME}打印制作摘要",
        details=(
            f"图案尺寸：{summary.columns} 列 × {summary.rows} 行",
            (
                f"材料统计：{summary.non_empty_bead_count} 颗拼豆，"
                f"{summary.blank_count} 个空格，"
                f"{summary.used_color_count} 种颜色"
            ),
            (
                f"预计成品尺寸：{_format_millimeters(summary.width_mm)} × "
                f"{_format_millimeters(summary.height_mm)} 毫米"
            ),
            (
                "拼豆直径与间距："
                f"{_format_millimeters(summary.bead_diameter_mm)} / "
                f"{_format_millimeters(summary.bead_pitch_mm)} 毫米"
            ),
            (
                f"拼板规格：{summary.board_rows} 行 × "
                f"{summary.board_columns} 列"
            ),
            (
                f"拼板布局：{summary.board_layout_rows} 行 × "
                f"{summary.board_layout_columns} 列"
            ),
            f"文档页数：{plan.page_count} 页",
        ),
        legend_heading="全部材料清单",
        legend_columns="色板｜系列｜色号｜数量",
        legend_lines=tuple(
            _pdf_material_legend_label(
                color_id,
                count,
                include_palette=True,
            )
            for color_id, count in summary.per_color_counts
        ),
        footer=f"第 1 页，共 {plan.page_count} 页",
    )


def _pdf_board_text(
    project: BeadProject,
    plan: PdfDocumentPlan,
    board: PdfBoardPage,
) -> PdfBoardText:
    scale_label = (
        "1:1"
        if math.isclose(board.scale, 1.0)
        else f"{board.scale * 100:.1f}%"
    )
    return PdfBoardText(
        heading=(
            f"第 {board.board_row} 行第 {board.board_column} 块拼板"
            f"｜原图第 {board.row_start}–{board.row_end} 行，"
            f"第 {board.column_start}–{board.column_end} 列"
        ),
        page_and_scale=(
            f"第 {board.page_number} 页，共 {plan.page_count} 页"
            f"｜打印比例：{scale_label}"
        ),
        dimensions_and_counts=(
            f"拼板尺寸：{_format_millimeters(board.width_mm)} × "
            f"{_format_millimeters(board.height_mm)} 毫米"
            f"｜拼豆间距："
            f"{_format_millimeters(project.grid.bead_pitch_mm)} 毫米"
            f"｜{board.non_empty_bead_count} 颗拼豆，"
            f"{board.blank_count} 个空格，"
            f"{len(board.per_color_counts)} 种颜色"
        ),
        legend_heading="本板材料",
        legend_columns="系列｜色号｜数量",
        legend_lines=tuple(
            _pdf_material_legend_label(
                color_id,
                count,
                include_palette=False,
            )
            for color_id, count in board.per_color_counts
        ),
        footer=(
            f"第 {board.page_number} 页，共 {plan.page_count} 页"
        ),
    )


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
    if template == "annotated":
        return _render_annotated_pattern_image(project)
    if template == "numbered":
        return _render_numbered_pattern_image(project)
    if template == "rounded":
        return _render_rounded_pattern_image(project)
    raise ApiError(422, "EXPORT_TEMPLATE_INVALID", "导出图片样式不受支持。")


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


def _render_rounded_pattern_image(project: BeadProject) -> Image.Image:
    canvas = Image.new(
        "RGBA",
        (
            project.grid.columns * ROUNDED_CELL_PITCH,
            project.grid.rows * ROUNDED_CELL_PITCH,
        ),
        EXPORT_COLORS["background"],
    )
    draw = ImageDraw.Draw(canvas)
    for row_index, row in enumerate(project.cells):
        for column_index, cell in enumerate(row):
            if not isinstance(cell, FilledBeadCell):
                continue
            left = (
                column_index * ROUNDED_CELL_PITCH
                + ROUNDED_CELL_INSET
            )
            top = (
                row_index * ROUNDED_CELL_PITCH
                + ROUNDED_CELL_INSET
            )
            right = (
                (column_index + 1) * ROUNDED_CELL_PITCH
                - ROUNDED_CELL_INSET
                - 1
            )
            bottom = (
                (row_index + 1) * ROUNDED_CELL_PITCH
                - ROUNDED_CELL_INSET
                - 1
            )
            fill = str(COLOR_BY_ID[cell.color_id]["displayHex"])
            draw.rounded_rectangle(
                (left, top, right, bottom),
                radius=ROUNDED_CELL_RADIUS,
                fill=fill,
                outline=_rounded_cell_outline(fill),
                width=1,
            )
    return canvas


def _rounded_cell_outline(color_hex: str) -> str | None:
    red, green, blue = bytes.fromhex(color_hex.removeprefix("#"))
    luminance = (
        0.2126 * red
        + 0.7152 * green
        + 0.0722 * blue
    )
    if luminance > 235:
        return EXPORT_COLORS["grid"]
    return None


def _render_annotated_pattern_image(project: BeadProject) -> Image.Image:
    offset = LABEL_MARGIN
    width = offset + project.grid.columns * CELL_SIZE + LEGEND_WIDTH
    height = max(
        offset + project.grid.rows * CELL_SIZE,
        230 + _used_color_count(project) * 30,
    )
    canvas = Image.new("RGBA", (width, height), EXPORT_COLORS["background"])
    draw = ImageDraw.Draw(canvas)
    heading_font = _load_cjk_font(18)
    body_font = _load_cjk_font(13)
    coordinate_font = _load_cjk_font(11)
    text = _annotated_png_text(project)
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

    for coordinate in _layout_annotated_png_coordinates(
        project,
        coordinate_font,
        canvas.size,
    ):
        draw.text(
            coordinate.position,
            coordinate.label,
            anchor=coordinate.anchor,
            fill=EXPORT_COLORS["textSecondary"],
            font=coordinate_font,
        )

    legend_left = offset + project.grid.columns * CELL_SIZE + 24
    draw.text(
        (legend_left, 18),
        text.title,
        fill=EXPORT_COLORS["textPrimary"],
        font=heading_font,
    )
    draw.text(
        (legend_left, 50),
        text.dimensions,
        fill=EXPORT_COLORS["textPrimary"],
        font=body_font,
    )
    draw.text(
        (legend_left, 78),
        text.bead_count,
        fill=EXPORT_COLORS["textPrimary"],
        font=body_font,
    )
    draw.text(
        (legend_left, 106),
        text.blank_count,
        fill=EXPORT_COLORS["textSecondary"],
        font=body_font,
    )
    draw.text(
        (legend_left, 134),
        text.color_count,
        fill=EXPORT_COLORS["textSecondary"],
        font=body_font,
    )
    draw.text(
        (legend_left, 166),
        text.legend_heading,
        fill=EXPORT_COLORS["textPrimary"],
        font=heading_font,
    )
    legend_top = 198
    statistics = _statistics(project)
    for index, (color_id, count) in enumerate(
        statistics["perColorCounts"].items()
    ):
        color = COLOR_BY_ID[color_id]
        draw.rectangle(
            (legend_left, legend_top, legend_left + 14, legend_top + 14),
            fill=color["displayHex"],
            outline=EXPORT_COLORS["beadOutline"],
        )
        draw.text(
            (legend_left + 22, legend_top + 2),
            text.legend_lines[index],
            fill=EXPORT_COLORS["textPrimary"],
            font=body_font,
        )
        legend_top += 30
    return canvas


def _render_numbered_pattern_image(project: BeadProject) -> Image.Image:
    text = _numbered_png_text(project)
    statistics = _statistics(project)
    used_colors = tuple(statistics["perColorCounts"].items())
    cell_size = _numbered_cell_size(project)
    scale = max(1.0, cell_size / CELL_SIZE)
    header_height = round(NUMBERED_HEADER_HEIGHT * scale)
    outer_margin = round(NUMBERED_OUTER_MARGIN * scale)
    coordinate_gutter = round(
        NUMBERED_COORDINATE_GUTTER * scale
    )
    section_gap = round(NUMBERED_SECTION_GAP * scale)
    legend_title_height = round(
        NUMBERED_LEGEND_TITLE_HEIGHT * scale
    )
    legend_row_height = round(
        NUMBERED_LEGEND_ROW_HEIGHT * scale
    )
    total_height = round(NUMBERED_TOTAL_HEIGHT * scale)
    grid_width = project.grid.columns * cell_size
    grid_height = project.grid.rows * cell_size
    canvas_width = max(
        round(NUMBERED_MIN_WIDTH * scale),
        grid_width
        + 2 * (outer_margin + coordinate_gutter),
    )
    legend_available_width = canvas_width - 2 * outer_margin
    legend_columns = min(
        NUMBERED_MAX_LEGEND_COLUMNS,
        max(1, len(used_colors)),
        max(
            1,
            legend_available_width
            // round(
                NUMBERED_LEGEND_MIN_COLUMN_WIDTH * scale
            ),
        ),
    )
    legend_rows = (
        math.ceil(len(used_colors) / legend_columns)
        if used_colors
        else 0
    )
    grid_left = (canvas_width - grid_width) // 2
    grid_top = header_height + coordinate_gutter
    grid_right = grid_left + grid_width
    grid_bottom = grid_top + grid_height
    legend_top = grid_bottom + coordinate_gutter + section_gap
    canvas_height = (
        legend_top
        + legend_title_height
        + legend_rows * legend_row_height
        + total_height
        + outer_margin
    )
    canvas = Image.new(
        "RGBA",
        (canvas_width, canvas_height),
        EXPORT_COLORS["background"],
    )
    draw = ImageDraw.Draw(canvas)
    header_font = _load_cjk_font(round(24 * scale))
    header_detail_font = _load_cjk_font(round(13 * scale))
    coordinate_font = _load_cjk_font(round(10 * scale))
    cell_font = _load_cjk_font(round(8 * scale))
    legend_heading_font = _load_cjk_font(round(22 * scale))
    legend_font = _load_cjk_font(round(36 * scale))

    draw.rectangle(
        (0, 0, canvas_width, header_height),
        fill=EXPORT_COLORS["textPrimary"],
    )
    draw.text(
        (outer_margin, round(18 * scale)),
        text.title,
        fill=EXPORT_COLORS["background"],
        font=header_font,
    )
    draw.text(
        (outer_margin, round(56 * scale)),
        "按格定位 · 按色备料",
        fill=EXPORT_COLORS["grid"],
        font=header_detail_font,
    )
    draw.text(
        (
            canvas_width - outer_margin,
            round(24 * scale),
        ),
        text.summary,
        anchor="ra",
        fill=EXPORT_COLORS["background"],
        font=header_detail_font,
    )
    draw.text(
        (
            canvas_width - outer_margin,
            round(54 * scale),
        ),
        text.palette,
        anchor="ra",
        fill=EXPORT_COLORS["grid"],
        font=header_detail_font,
    )

    for row_index, row in enumerate(project.cells):
        for column_index, cell in enumerate(row):
            left = grid_left + column_index * cell_size
            top = grid_top + row_index * cell_size
            right = left + cell_size
            bottom = top + cell_size
            fill = EXPORT_COLORS["background"]
            if isinstance(cell, FilledBeadCell):
                fill = str(COLOR_BY_ID[cell.color_id]["displayHex"])
            draw.rectangle(
                (left, top, right, bottom),
                fill=fill,
                outline=EXPORT_COLORS["grid"],
                width=1,
            )
            if isinstance(cell, FilledBeadCell):
                code = str(COLOR_BY_ID[cell.color_id]["code"])
                draw.text(
                    (
                        left + cell_size / 2,
                        top + cell_size / 2,
                    ),
                    code,
                    anchor="mm",
                    fill=_numbered_cell_text_color(fill),
                    font=cell_font,
                )

    for column in range(0, project.grid.columns + 1, 10):
        x = grid_left + column * cell_size
        draw.line(
            (x, grid_top, x, grid_bottom),
            fill=EXPORT_COLORS["gridStrong"],
            width=2,
        )
    for row in range(0, project.grid.rows + 1, 10):
        y = grid_top + row * cell_size
        draw.line(
            (grid_left, y, grid_right, y),
            fill=EXPORT_COLORS["gridStrong"],
            width=2,
        )

    for column in range(project.grid.columns):
        if not _should_label_numbered_coordinate(
            column,
            project.grid.columns,
        ):
            continue
        center_x = grid_left + column * cell_size + cell_size / 2
        label = str(column + 1)
        draw.text(
            (center_x, grid_top - round(8 * scale)),
            label,
            anchor="ms",
            fill=EXPORT_COLORS["textSecondary"],
            font=coordinate_font,
        )
        draw.text(
            (center_x, grid_bottom + round(8 * scale)),
            label,
            anchor="ma",
            fill=EXPORT_COLORS["textSecondary"],
            font=coordinate_font,
        )
    for row in range(project.grid.rows):
        if not _should_label_numbered_coordinate(
            row,
            project.grid.rows,
        ):
            continue
        center_y = grid_top + row * cell_size + cell_size / 2
        label = str(row + 1)
        draw.text(
            (grid_left - round(8 * scale), center_y),
            label,
            anchor="rm",
            fill=EXPORT_COLORS["textSecondary"],
            font=coordinate_font,
        )
        draw.text(
            (grid_right + round(8 * scale), center_y),
            label,
            anchor="lm",
            fill=EXPORT_COLORS["textSecondary"],
            font=coordinate_font,
        )

    draw.line(
        (
            outer_margin,
            legend_top,
            canvas_width - outer_margin,
            legend_top,
        ),
        fill=EXPORT_COLORS["gridStrong"],
        width=1,
    )
    draw.text(
        (outer_margin, legend_top + round(14 * scale)),
        text.legend_heading,
        fill=EXPORT_COLORS["textPrimary"],
        font=legend_heading_font,
    )
    legend_items_top = legend_top + legend_title_height
    legend_column_width = legend_available_width / legend_columns
    legend_swatch_size = round(72 * scale)
    for index, (color_id, count) in enumerate(used_colors):
        column = index // max(1, legend_rows)
        row = index % max(1, legend_rows)
        left = (
            outer_margin
            + column * legend_column_width
        )
        top = legend_items_top + row * legend_row_height
        color = COLOR_BY_ID[color_id]
        draw.rectangle(
            (
                left,
                top + round(5 * scale),
                left + legend_swatch_size,
                top + round(5 * scale) + legend_swatch_size,
            ),
            fill=color["displayHex"],
            outline=EXPORT_COLORS["gridStrong"],
            width=1,
        )
        draw.text(
            (
                left + round(88 * scale),
                top + round(14 * scale),
            ),
            str(color["code"]),
            fill=EXPORT_COLORS["textPrimary"],
            font=legend_font,
        )
        draw.text(
            (
                left
                + legend_column_width
                - round(14 * scale),
                top + round(14 * scale),
            ),
            f"{count} 颗",
            anchor="ra",
            fill=EXPORT_COLORS["textPrimary"],
            font=legend_font,
        )

    total_top = (
        legend_items_top
        + legend_rows * legend_row_height
        + round(12 * scale)
    )
    draw.line(
        (
            outer_margin,
            total_top,
            canvas_width - outer_margin,
            total_top,
        ),
        fill=EXPORT_COLORS["grid"],
        width=1,
    )
    draw.text(
        (
            canvas_width - outer_margin,
            total_top + round(14 * scale),
        ),
        text.total,
        anchor="ra",
        fill=EXPORT_COLORS["textPrimary"],
        font=legend_heading_font,
    )
    return canvas


def _numbered_cell_size(project: BeadProject) -> int:
    maximum_dimension = max(
        project.grid.columns,
        project.grid.rows,
    )
    return min(
        NUMBERED_MAX_CELL_SIZE,
        max(
            NUMBERED_MIN_CELL_SIZE,
            NUMBERED_MAX_GRID_SPAN // maximum_dimension,
        ),
    )


def _should_label_numbered_coordinate(
    index: int,
    count: int,
) -> bool:
    return (
        index == 0
        or index == count - 1
        or (index + 1) % 10 == 0
    )


def _numbered_cell_text_color(color_hex: str) -> str:
    red, green, blue = bytes.fromhex(color_hex.removeprefix("#"))
    luminance = (
        0.2126 * red
        + 0.7152 * green
        + 0.0722 * blue
    )
    if luminance < 145:
        return EXPORT_COLORS["background"]
    return EXPORT_COLORS["textPrimary"]


def _layout_annotated_png_coordinates(
    project: BeadProject,
    font: ImageFont.FreeTypeFont,
    canvas_size: tuple[int, int],
) -> tuple[CoordinateLabelPlacement, ...]:
    grid_left = LABEL_MARGIN
    grid_top = LABEL_MARGIN
    grid_right = grid_left + project.grid.columns * CELL_SIZE
    grid_bottom = grid_top + project.grid.rows * CELL_SIZE
    legend_left = grid_right + 24
    column_lane_step = font.size + COORDINATE_LABEL_GAP
    row_labels = tuple(
        _row_coordinate_label(row + 1)
        for row in range(project.grid.rows)
        if _should_label_png_coordinate(row, project.grid.rows)
    )
    row_lane_step = (
        _maximum_coordinate_label_width(row_labels, font)
        + COORDINATE_LABEL_GAP
    )
    candidates: list[_CoordinateLabelCandidate] = []

    for column in range(project.grid.columns):
        if not _should_label_png_coordinate(
            column,
            project.grid.columns,
        ):
            continue
        center_x = grid_left + column * CELL_SIZE + CELL_SIZE / 2
        base_y = grid_top - 8
        candidates.append(
            _CoordinateLabelCandidate(
                axis="column",
                index=column,
                label=_column_coordinate_label(column + 1),
                positions=(
                    (center_x, base_y),
                    (center_x, base_y - column_lane_step),
                ),
                anchor=_column_coordinate_anchor(
                    column,
                    project.grid.columns,
                    "s",
                ),
                boundary=_is_coordinate_boundary(
                    column,
                    project.grid.columns,
                ),
            )
        )

    for row in range(project.grid.rows):
        if not _should_label_png_coordinate(row, project.grid.rows):
            continue
        center_y = grid_top + row * CELL_SIZE + CELL_SIZE / 2
        base_x = grid_left - 8
        candidates.append(
            _CoordinateLabelCandidate(
                axis="row",
                index=row,
                label=_row_coordinate_label(row + 1),
                positions=(
                    (base_x, center_y),
                    (base_x - row_lane_step, center_y),
                ),
                anchor="rm",
                boundary=_is_coordinate_boundary(
                    row,
                    project.grid.rows,
                ),
            )
        )

    return _place_coordinate_labels(
        tuple(candidates),
        font,
        canvas_box=(0, 0, canvas_size[0], canvas_size[1]),
        forbidden_boxes=(
            (grid_left, grid_top, grid_right, grid_bottom),
            (legend_left, 0, canvas_size[0], canvas_size[1]),
        ),
    )


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
    board_drafts: list[_PdfBoardDraft] = []

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
            board_drafts.append(
                _PdfBoardDraft(
                    board_id=f"B{board_row + 1}-{board_column + 1}",
                    board_row=board_row + 1,
                    board_column=board_column + 1,
                    row_start=row_start_index + 1,
                    row_end=row_end_index,
                    column_start=column_start_index + 1,
                    column_end=column_end_index,
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

    board_font = _load_cjk_font(PDF_BOARD_BODY_FONT_SIZE)
    legend_top, legend_bottom = _pdf_board_legend_vertical_bounds()
    required_legend_width = max(
        (
            _measure_pdf_legend(
                board.per_color_counts,
                board_font,
                legend_bottom - legend_top,
                include_palette=False,
            ).required_width
            for board in board_drafts
        ),
        default=0,
    )
    legend_width_mm = max(
        PDF_LEGEND_WIDTH_MM,
        _px_to_mm(required_legend_width + 1),
    )
    scale = _pdf_board_scale(project, legend_width_mm)
    boards = tuple(
        PdfBoardPage(
            board_id=board.board_id,
            board_row=board.board_row,
            board_column=board.board_column,
            page_number=index + 2,
            row_start=board.row_start,
            row_end=board.row_end,
            column_start=board.column_start,
            column_end=board.column_end,
            scale=scale,
            width_mm=board.width_mm,
            height_mm=board.height_mm,
            non_empty_bead_count=board.non_empty_bead_count,
            blank_count=board.blank_count,
            per_color_counts=board.per_color_counts,
            legend_width_mm=legend_width_mm,
        )
        for index, board in enumerate(board_drafts)
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
    plan = PdfDocumentPlan(summary=summary, boards=boards)
    _layout_pdf_legend(
        summary.per_color_counts,
        _pdf_summary_legend_box(),
        _load_cjk_font(PDF_SUMMARY_BODY_FONT_SIZE),
        include_palette=True,
    )
    for board in boards:
        _layout_pdf_legend(
            board.per_color_counts,
            _pdf_board_legend_box(board),
            board_font,
            include_palette=False,
        )
    return plan


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
            title=f"{PRODUCT_NAME}打印制作",
            subject=(
                f"{project.grid.columns} 列 × {project.grid.rows} 行；"
                f"共 {plan.page_count} 页"
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
    heading_font = _load_cjk_font(PDF_SUMMARY_HEADING_FONT_SIZE)
    body_font = _load_cjk_font(PDF_SUMMARY_BODY_FONT_SIZE)
    text = _pdf_summary_text(plan)
    left = _mm_to_px(PDF_MARGIN_MM)
    top = _mm_to_px(PDF_MARGIN_MM)

    draw.text(
        (left, top),
        text.title,
        fill=EXPORT_COLORS["textPrimary"],
        font=heading_font,
    )
    detail_top = top + 52
    for index, line in enumerate(text.details):
        draw.text(
            (left, detail_top + index * 30),
            line,
            fill=EXPORT_COLORS["textPrimary"],
            font=body_font,
        )

    legend_top = detail_top + len(text.details) * 30 + 22
    draw.text(
        (left, legend_top),
        text.legend_heading,
        fill=EXPORT_COLORS["textPrimary"],
        font=heading_font,
    )
    draw.text(
        (left, legend_top + PDF_SUMMARY_LEGEND_DESCRIPTION_OFFSET),
        text.legend_columns,
        fill=EXPORT_COLORS["textSecondary"],
        font=body_font,
    )
    _draw_pdf_legend(
        draw,
        plan.summary.per_color_counts,
        _pdf_summary_legend_box(),
        body_font,
        include_palette=True,
    )
    _draw_pdf_footer(
        draw,
        text.footer,
        page.width,
        page.height,
        body_font,
    )
    return page


def _render_pdf_board_page(
    project: BeadProject,
    plan: PdfDocumentPlan,
    board: PdfBoardPage,
) -> Image.Image:
    page = _new_pdf_page()
    draw = ImageDraw.Draw(page)
    heading_font = _load_cjk_font(PDF_BOARD_HEADING_FONT_SIZE)
    body_font = _load_cjk_font(PDF_BOARD_BODY_FONT_SIZE)
    coordinate_font = _load_cjk_font(PDF_COORDINATE_FONT_SIZE)
    text = _pdf_board_text(project, plan, board)
    left = _mm_to_px(PDF_MARGIN_MM)
    top = _mm_to_px(PDF_MARGIN_MM)

    draw.text(
        (left, top),
        text.heading,
        fill=EXPORT_COLORS["textPrimary"],
        font=heading_font,
    )
    draw.text(
        (left, top + 38),
        text.page_and_scale,
        fill=EXPORT_COLORS["textSecondary"],
        font=body_font,
    )
    draw.text(
        (left, top + 66),
        text.dimensions_and_counts,
        fill=EXPORT_COLORS["textSecondary"],
        font=body_font,
    )

    _draw_pdf_board_pattern(draw, project, board, coordinate_font)
    legend_box = _pdf_board_legend_box(board)
    legend_left = legend_box[0]
    legend_top = _mm_to_px(PDF_MARGIN_MM + PDF_HEADER_MM)
    draw.text(
        (legend_left, legend_top),
        text.legend_heading,
        fill=EXPORT_COLORS["textPrimary"],
        font=heading_font,
    )
    draw.text(
        (legend_left, legend_top + PDF_BOARD_LEGEND_DESCRIPTION_OFFSET),
        text.legend_columns,
        fill=EXPORT_COLORS["textSecondary"],
        font=body_font,
    )
    _draw_pdf_legend(
        draw,
        board.per_color_counts,
        legend_box,
        body_font,
        include_palette=False,
    )
    _draw_pdf_footer(
        draw,
        text.footer,
        page.width,
        page.height,
        body_font,
    )
    return page


def _layout_pdf_board_coordinates(
    project: BeadProject,
    board: PdfBoardPage,
    font: ImageFont.FreeTypeFont,
) -> tuple[CoordinateLabelPlacement, ...]:
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
    grid_right = origin_x + bead_diameter + (columns - 1) * pitch
    grid_bottom = origin_y + bead_diameter + (rows - 1) * pitch
    legend_box = _pdf_board_legend_box(board)
    column_lane_step = font.size + COORDINATE_LABEL_GAP
    row_labels = tuple(
        _row_coordinate_label(board.row_start + row)
        for row in range(rows)
        if _should_label_coordinate(row, rows, pitch)
    )
    row_lane_step = (
        _maximum_coordinate_label_width(row_labels, font)
        + COORDINATE_LABEL_GAP
    )
    candidates: list[_CoordinateLabelCandidate] = []

    for column in range(columns):
        if not _should_label_coordinate(column, columns, pitch):
            continue
        center_x = (
            origin_x + bead_diameter / 2 + column * pitch
        )
        base_y = origin_y - coordinate_gutter
        candidates.append(
            _CoordinateLabelCandidate(
                axis="column",
                index=column,
                label=_column_coordinate_label(
                    board.column_start + column
                ),
                positions=(
                    (round(center_x), base_y),
                    (
                        round(center_x),
                        base_y - column_lane_step,
                    ),
                ),
                anchor=_column_coordinate_anchor(
                    column,
                    columns,
                    "a",
                ),
                boundary=_is_coordinate_boundary(column, columns),
            )
        )

    for row in range(rows):
        if not _should_label_coordinate(row, rows, pitch):
            continue
        center_y = origin_y + bead_diameter / 2 + row * pitch
        base_x = origin_x - 4
        candidates.append(
            _CoordinateLabelCandidate(
                axis="row",
                index=row,
                label=_row_coordinate_label(board.row_start + row),
                positions=(
                    (base_x, round(center_y)),
                    (base_x - row_lane_step, round(center_y)),
                ),
                anchor="rm",
                boundary=_is_coordinate_boundary(row, rows),
            )
        )

    return _place_coordinate_labels(
        tuple(candidates),
        font,
        canvas_box=(
            0,
            0,
            _mm_to_px(PDF_PAGE_WIDTH_MM),
            _mm_to_px(PDF_PAGE_HEIGHT_MM),
        ),
        forbidden_boxes=(
            (
                math.floor(origin_x),
                math.floor(origin_y),
                math.ceil(grid_right),
                math.ceil(grid_bottom),
            ),
            (
                legend_box[0],
                _mm_to_px(PDF_MARGIN_MM + PDF_HEADER_MM),
                _mm_to_px(PDF_PAGE_WIDTH_MM),
                _mm_to_px(PDF_PAGE_HEIGHT_MM),
            ),
        ),
    )


def _draw_pdf_board_pattern(
    draw: ImageDraw.ImageDraw,
    project: BeadProject,
    board: PdfBoardPage,
    font: ImageFont.FreeTypeFont,
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

    for coordinate in _layout_pdf_board_coordinates(
        project,
        board,
        font,
    ):
        draw.text(
            coordinate.position,
            coordinate.label,
            anchor=coordinate.anchor,
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
    if not counts:
        draw.text(
            (box[0], box[1]),
            "暂无拼豆颜色",
            anchor="lt",
            fill=EXPORT_COLORS["textSecondary"],
            font=font,
        )
        return
    layout = _layout_pdf_legend(
        counts,
        box,
        font,
        include_palette=include_palette,
    )
    for item in layout.items:
        color = COLOR_BY_ID[item.color_id]
        draw.rectangle(
            item.swatch_box,
            fill=color["displayHex"],
            outline=EXPORT_COLORS["beadOutline"],
        )
        draw.text(
            item.text_position,
            item.label,
            anchor="lt",
            fill=EXPORT_COLORS["textPrimary"],
            font=font,
        )


def _layout_pdf_legend(
    counts: tuple[tuple[str, int], ...],
    box: tuple[int, int, int, int],
    font: ImageFont.ImageFont,
    *,
    include_palette: bool,
) -> PdfLegendLayout:
    left, top, right, bottom = box
    measurement = _measure_pdf_legend(
        counts,
        font,
        bottom - top,
        include_palette=include_palette,
    )
    if (
        measurement.required_width > right - left
        or measurement.required_height > bottom - top
    ):
        raise ApiError(
            422,
            "PDF_EXPORT_LIMIT_EXCEEDED",
            (
                "材料图例无法在可打印区域内清晰排版，"
                "请减少颜色数量后重试。"
            ),
        )

    column_offsets: list[int] = []
    next_offset = 0
    for column_width in measurement.column_widths:
        column_offsets.append(next_offset)
        next_offset += column_width + PDF_LEGEND_COLUMN_GAP

    items = []
    for index, (color_id, count, label, _width, height) in enumerate(
        measurement.entries
    ):
        column = index // measurement.rows_per_column
        row = index % measurement.rows_per_column
        x = left + column_offsets[column]
        row_top = top + row * measurement.row_height
        swatch_top = row_top + (
            measurement.row_height - PDF_LEGEND_SWATCH_SIZE
        ) // 2
        text_top = row_top + (measurement.row_height - height) // 2
        items.append(
            PdfLegendItemLayout(
                color_id=color_id,
                count=count,
                label=label,
                swatch_box=(
                    x,
                    swatch_top,
                    x + PDF_LEGEND_SWATCH_SIZE,
                    swatch_top + PDF_LEGEND_SWATCH_SIZE,
                ),
                text_position=(
                    x + PDF_LEGEND_SWATCH_SIZE + PDF_LEGEND_TEXT_GAP,
                    text_top,
                ),
            )
        )
    return PdfLegendLayout(
        items=tuple(items),
        required_width=measurement.required_width,
        required_height=measurement.required_height,
        column_count=len(measurement.column_widths),
        rows_per_column=measurement.rows_per_column,
    )


def _measure_pdf_legend(
    counts: tuple[tuple[str, int], ...],
    font: ImageFont.ImageFont,
    available_height: int,
    *,
    include_palette: bool,
) -> _PdfLegendMeasurement:
    measurement_image = Image.new("L", (1, 1))
    measurement_draw = ImageDraw.Draw(measurement_image)
    entries = []
    for color_id, count in counts:
        label = _pdf_material_legend_label(
            color_id,
            count,
            include_palette=include_palette,
        )
        text_box = measurement_draw.textbbox(
            (0, 0),
            label,
            font=font,
            anchor="lt",
        )
        entries.append(
            (
                color_id,
                count,
                label,
                text_box[2] - text_box[0],
                text_box[3] - text_box[1],
            )
        )

    maximum_text_height = max(
        (entry[4] for entry in entries),
        default=int(getattr(font, "size", 11)),
    )
    row_height = max(
        PDF_LEGEND_SWATCH_SIZE,
        maximum_text_height,
    ) + PDF_LEGEND_ROW_GAP
    rows_per_column = max(1, available_height // row_height)
    column_count = (
        math.ceil(len(entries) / rows_per_column) if entries else 0
    )
    column_widths = []
    for column in range(column_count):
        start = column * rows_per_column
        end = min(len(entries), start + rows_per_column)
        column_widths.append(
            max(
                PDF_LEGEND_SWATCH_SIZE
                + PDF_LEGEND_TEXT_GAP
                + entry[3]
                for entry in entries[start:end]
            )
        )
    required_width = sum(column_widths) + max(
        0,
        len(column_widths) - 1,
    ) * PDF_LEGEND_COLUMN_GAP
    used_rows = min(rows_per_column, len(entries))
    required_height = used_rows * row_height
    return _PdfLegendMeasurement(
        entries=tuple(entries),
        column_widths=tuple(column_widths),
        required_width=required_width,
        required_height=required_height,
        row_height=row_height,
        rows_per_column=rows_per_column,
    )


def _pdf_summary_legend_box() -> tuple[int, int, int, int]:
    left = _mm_to_px(PDF_MARGIN_MM)
    top = _mm_to_px(PDF_MARGIN_MM)
    detail_top = top + 52
    legend_top = detail_top + 7 * 30 + 22
    return (
        left,
        legend_top + PDF_SUMMARY_LEGEND_ITEMS_OFFSET,
        _mm_to_px(PDF_PAGE_WIDTH_MM) - left,
        _mm_to_px(PDF_PAGE_HEIGHT_MM)
        - _mm_to_px(PDF_FOOTER_MM + 4),
    )


def _pdf_board_legend_vertical_bounds() -> tuple[int, int]:
    legend_top = _mm_to_px(PDF_MARGIN_MM + PDF_HEADER_MM)
    return (
        legend_top + PDF_BOARD_LEGEND_ITEMS_OFFSET,
        _mm_to_px(PDF_PAGE_HEIGHT_MM)
        - _mm_to_px(PDF_FOOTER_MM + PDF_MARGIN_MM),
    )


def _pdf_board_legend_box(
    board: PdfBoardPage,
) -> tuple[int, int, int, int]:
    page_width = _mm_to_px(PDF_PAGE_WIDTH_MM)
    right = page_width - _mm_to_px(PDF_MARGIN_MM)
    top, bottom = _pdf_board_legend_vertical_bounds()
    return (
        right - _mm_to_px(board.legend_width_mm),
        top,
        right,
        bottom,
    )


def _draw_pdf_footer(
    draw: ImageDraw.ImageDraw,
    text: str,
    page_width: int,
    page_height: int,
    font: ImageFont.ImageFont,
) -> None:
    draw.text(
        (
            page_width - _mm_to_px(PDF_MARGIN_MM),
            page_height - _mm_to_px(PDF_MARGIN_MM),
        ),
        text,
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


def _pdf_board_scale(
    project: BeadProject,
    legend_width_mm: float,
) -> float:
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
        - legend_width_mm
        - PDF_COORDINATE_GUTTER_MM
    )
    available_height = (
        PDF_PAGE_HEIGHT_MM
        - 2 * PDF_MARGIN_MM
        - PDF_HEADER_MM
        - PDF_FOOTER_MM
        - PDF_COORDINATE_GUTTER_MM
    )
    if available_width <= 0 or available_height <= 0:
        raise ApiError(
            422,
            "PDF_EXPORT_LIMIT_EXCEEDED",
            (
                "材料图例无法在可打印区域内清晰排版，"
                "请减少颜色数量后重试。"
            ),
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


def _format_millimeters(value: float) -> str:
    tenths = math.floor(value * 10 + 0.5 + 1e-9)
    return f"{tenths // 10}.{tenths % 10}"


def _mm_to_px(value_mm: float) -> int:
    return round(value_mm * PDF_DPI / 25.4)


def _px_to_mm(value_px: int) -> float:
    return value_px * 25.4 / PDF_DPI


def _place_coordinate_labels(
    candidates: tuple[_CoordinateLabelCandidate, ...],
    font: ImageFont.FreeTypeFont,
    *,
    canvas_box: tuple[float, float, float, float],
    forbidden_boxes: tuple[
        tuple[float, float, float, float],
        ...,
    ],
) -> tuple[CoordinateLabelPlacement, ...]:
    measurement_image = Image.new("L", (1, 1))
    measurement_draw = ImageDraw.Draw(measurement_image)
    occupied_boxes: list[tuple[float, float, float, float]] = []
    placements: list[CoordinateLabelPlacement] = []
    axis_order = {"column": 0, "row": 1}

    try:
        ordered_candidates = sorted(
            candidates,
            key=lambda candidate: (
                not candidate.boundary,
                axis_order[candidate.axis],
                candidate.index,
            ),
        )
        for candidate in ordered_candidates:
            for position in candidate.positions:
                box = measurement_draw.textbbox(
                    position,
                    candidate.label,
                    font=font,
                    anchor=candidate.anchor,
                )
                if not _coordinate_box_is_inside(box, canvas_box):
                    continue
                if any(
                    _coordinate_boxes_overlap(box, forbidden)
                    for forbidden in forbidden_boxes
                ):
                    continue
                if any(
                    _coordinate_boxes_overlap(box, occupied)
                    for occupied in occupied_boxes
                ):
                    continue
                occupied_boxes.append(box)
                placements.append(
                    CoordinateLabelPlacement(
                        axis=candidate.axis,
                        index=candidate.index,
                        label=candidate.label,
                        position=position,
                        anchor=candidate.anchor,
                    )
                )
                break
    finally:
        measurement_image.close()

    return tuple(
        sorted(
            placements,
            key=lambda placement: (
                axis_order[placement.axis],
                placement.index,
            ),
        )
    )


def _maximum_coordinate_label_width(
    labels: tuple[str, ...],
    font: ImageFont.FreeTypeFont,
) -> int:
    measurement_image = Image.new("L", (1, 1))
    measurement_draw = ImageDraw.Draw(measurement_image)
    try:
        widths = []
        for label in labels:
            box = measurement_draw.textbbox(
                (0, 0),
                label,
                font=font,
                anchor="rm",
            )
            widths.append(box[2] - box[0])
        return max(widths, default=0)
    finally:
        measurement_image.close()


def _column_coordinate_anchor(
    index: int,
    count: int,
    vertical_anchor: str,
) -> str:
    if count == 1:
        horizontal_anchor = "m"
    elif index == 0:
        horizontal_anchor = "l"
    elif index == count - 1:
        horizontal_anchor = "r"
    else:
        horizontal_anchor = "m"
    return f"{horizontal_anchor}{vertical_anchor}"


def _is_coordinate_boundary(index: int, count: int) -> bool:
    return index == 0 or index == count - 1


def _coordinate_box_is_inside(
    box: tuple[float, float, float, float],
    container: tuple[float, float, float, float],
) -> bool:
    return (
        container[0] <= box[0] < box[2] <= container[2]
        and container[1] <= box[1] < box[3] <= container[3]
    )


def _coordinate_boxes_overlap(
    left: tuple[float, float, float, float],
    right: tuple[float, float, float, float],
) -> bool:
    return (
        left[0] < right[2]
        and right[0] < left[2]
        and left[1] < right[3]
        and right[1] < left[3]
    )


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
    board_layout_rows = math.ceil(
        project.grid.rows / project.grid.board_rows
    )
    board_layout_columns = math.ceil(
        project.grid.columns / project.grid.board_columns
    )
    width_mm = _physical_span_mm(
        project.grid.columns,
        project.grid.bead_pitch_mm,
        project.grid.bead_diameter_mm,
    )
    height_mm = _physical_span_mm(
        project.grid.rows,
        project.grid.bead_pitch_mm,
        project.grid.bead_diameter_mm,
    )
    writer.writerows(
        [
            ["项目摘要"],
            ["产品", PRODUCT_NAME],
            ["行数", project.grid.rows],
            ["列数", project.grid.columns],
            ["拼豆总数", statistics["nonEmptyBeadCount"]],
            ["空格数", statistics["blankCount"]],
            ["使用颜色数", len(statistics["perColorCounts"])],
            [
                "预计宽度（毫米）",
                _format_millimeters(width_mm),
            ],
            [
                "预计高度（毫米）",
                _format_millimeters(height_mm),
            ],
            [
                "拼豆直径（毫米）",
                _format_millimeters(project.grid.bead_diameter_mm),
            ],
            [
                "拼豆间距（毫米）",
                _format_millimeters(project.grid.bead_pitch_mm),
            ],
            [
                "拼板规格",
                (
                    f"{project.grid.board_rows} 行 × "
                    f"{project.grid.board_columns} 列"
                ),
            ],
            [
                "拼板布局",
                (
                    f"{board_layout_rows} 行 × "
                    f"{board_layout_columns} 列"
                ),
            ],
            [
                "拼板总数",
                board_layout_rows * board_layout_columns,
            ],
            [],
            ["材料清单"],
            [
                "颜色标识",
                "色板",
                "系列",
                "色号",
                "显示色值",
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
                _palette_label(color["paletteId"]),
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
            ["行", "列", "类型", "颜色标识", "色板", "系列", "色号"],
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
                    "拼豆" if isinstance(cell, FilledBeadCell) else "空格",
                    color["id"] if color else "",
                    _palette_label(color["paletteId"]) if color else "",
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
