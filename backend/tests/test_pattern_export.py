from __future__ import annotations

import io
import json
import math
import re
from collections.abc import Callable
from pathlib import Path

import pytest
from PIL import Image, ImageDraw, ImageFont
from pydantic import ValidationError

from app import limits, pattern_export
from app.errors import ApiError
from app.generated_palettes import PALETTE_COLORS
from app.models import BeadProject, PatternExportRequest
from app.pattern_export import (
    CELL_SIZE,
    LABEL_MARGIN,
    create_pattern_export,
)
from test_pattern_contracts import color_id, project_payload

SHARED_FIXTURE_DIRECTORY = (
    Path(__file__).resolve().parents[2] / "tests" / "fixtures"
)


def two_cell_project() -> BeadProject:
    payload = project_payload()
    selected_color = color_id("default", offset=6)
    payload["grid"].update({"rows": 1, "columns": 2})
    payload["palette"].update(
        {
            "availableColorIds": [selected_color],
            "maximumColors": 1,
        }
    )
    payload["cells"] = [
        [
            {"kind": "bead", "colorId": selected_color},
            {"kind": "empty"},
        ]
    ]
    return BeadProject.model_validate(payload)


def shared_golden_project() -> BeadProject:
    payload = json.loads(
        (
            SHARED_FIXTURE_DIRECTORY / "export-parity-project.json"
        ).read_text(encoding="utf-8")
    )
    return BeadProject.model_validate(payload)


def export_request(
    project: BeadProject,
    *,
    format_name: str,
    template: str = "annotated",
) -> PatternExportRequest:
    return PatternExportRequest.model_validate(
        {
            "project": project.model_dump(by_alias=True),
            "format": format_name,
            "template": template,
        }
    )


def test_export_request_uses_explicit_template_enum() -> None:
    project = two_cell_project()

    pure = export_request(project, format_name="png", template="pure")
    assert pure.template == "pure"
    numbered = export_request(
        project,
        format_name="png",
        template="numbered",
    )
    assert numbered.template == "numbered"
    rounded = export_request(
        project,
        format_name="png",
        template="rounded",
    )
    assert rounded.template == "rounded"

    with pytest.raises(ValidationError):
        PatternExportRequest.model_validate(
            {
                "project": project.model_dump(by_alias=True),
                "format": "png",
                "includeGrid": False,
            }
        )


def test_pure_png_is_matrix_only_and_keeps_empty_cells_transparent() -> None:
    project = two_cell_project()

    content, media_type, _ = create_pattern_export(
        export_request(project, format_name="png", template="pure")
    )
    image = Image.open(io.BytesIO(content)).convert("RGBA")

    assert media_type == "image/png"
    assert image.size == (2 * CELL_SIZE, CELL_SIZE)
    assert image.getpixel((CELL_SIZE // 2, 6))[3] == 255
    assert image.crop((CELL_SIZE, 0, 2 * CELL_SIZE, CELL_SIZE)).getchannel(
        "A"
    ).getextrema() == (0, 0)


def test_annotated_png_has_coordinates_grid_legend_and_semantic_colors() -> None:
    project = two_cell_project()
    selected = next(
        color
        for color in PALETTE_COLORS
        if color["id"] == project.cells[0][0].color_id
    )

    content, _, _ = create_pattern_export(
        export_request(project, format_name="png")
    )
    image = Image.open(io.BytesIO(content)).convert("RGBA")
    background = (255, 255, 255, 255)
    grid_color = (220, 226, 222, 255)
    legend_left = LABEL_MARGIN + project.grid.columns * CELL_SIZE + 24

    assert image.width > project.grid.columns * CELL_SIZE
    assert image.height > project.grid.rows * CELL_SIZE
    assert image.getpixel((image.width - 1, image.height - 1)) == background
    assert image.getpixel((LABEL_MARGIN, LABEL_MARGIN)) == grid_color
    assert image.getpixel((legend_left + 7, 205))[:3] == tuple(
        bytes.fromhex(selected["displayHex"][1:])
    )
    assert any(
        pixel != background
        for pixel in image.crop(
            (LABEL_MARGIN, 0, LABEL_MARGIN + CELL_SIZE, LABEL_MARGIN)
        ).get_flattened_data()
    )


def test_numbered_png_uses_full_color_cells_codes_and_count_legend() -> None:
    project = two_cell_project()
    selected = next(
        color
        for color in PALETTE_COLORS
        if color["id"] == project.cells[0][0].color_id
    )
    text_builder = getattr(pattern_export, "_numbered_png_text", None)
    cell_size_builder = getattr(pattern_export, "_numbered_cell_size", None)

    assert callable(text_builder), "numbered PNG text model is missing"
    assert callable(cell_size_builder), "numbered PNG cell sizing is missing"
    numbered_cell_size = cell_size_builder(project)
    assert numbered_cell_size == 44
    text = text_builder(project)
    assert text.cell_codes == ((selected["code"], ""),)
    assert text.legend_lines == (
        f"{selected['code']}｜1 颗",
    )
    assert text.total == "总计：1 颗"

    content, media_type, _ = create_pattern_export(
        export_request(
            project,
            format_name="png",
            template="numbered",
        )
    )
    image = Image.open(io.BytesIO(content)).convert("RGBA")
    background = (255, 255, 255, 255)
    selected_rgb = tuple(bytes.fromhex(selected["displayHex"][1:]))
    located_full_cell = False

    for top in range(image.height - numbered_cell_size + 1):
        for left in range(
            image.width - 2 * numbered_cell_size + 1
        ):
            if (
                image.getpixel((left + 2, top + 2))[:3] == selected_rgb
                and image.getpixel(
                    (left + numbered_cell_size + 2, top + 2)
                )
                == background
            ):
                located_full_cell = True
                break
        if located_full_cell:
            break

    assert media_type == "image/png"
    assert image.width > project.grid.columns * CELL_SIZE
    assert image.height >= 760
    assert located_full_cell


def test_rounded_png_is_a_clean_matrix_of_separated_rounded_squares() -> None:
    project = two_cell_project()
    selected = next(
        color
        for color in PALETTE_COLORS
        if color["id"] == project.cells[0][0].color_id
    )
    pitch = getattr(pattern_export, "ROUNDED_CELL_PITCH", None)

    assert pitch == 16

    content, media_type, _ = create_pattern_export(
        export_request(
            project,
            format_name="png",
            template="rounded",
        )
    )
    image = Image.open(io.BytesIO(content)).convert("RGBA")
    background = (255, 255, 255, 255)
    selected_rgb = tuple(bytes.fromhex(selected["displayHex"][1:]))

    assert media_type == "image/png"
    assert image.size == (2 * pitch, pitch)
    assert image.getpixel((0, 0)) == background
    assert image.getpixel((pitch // 2, pitch // 2))[:3] == selected_rgb
    assert image.getpixel((pitch - 1, pitch // 2)) == background
    assert image.crop((pitch, 0, 2 * pitch, pitch)).getchannel(
        "A"
    ).getextrema() == (255, 255)
    assert set(
        image.crop((pitch, 0, 2 * pitch, pitch)).get_flattened_data()
    ) == {background}


def test_rounded_png_keeps_white_beads_visible_against_the_canvas() -> None:
    project = BeadProject.model_validate(project_payload())
    pitch = 16

    content, _, _ = create_pattern_export(
        export_request(
            project,
            format_name="png",
            template="rounded",
        )
    )
    image = Image.open(io.BytesIO(content)).convert("RGBA")

    assert image.getpixel((pitch // 2, 1)) == (220, 226, 222, 255)
    assert image.getpixel((pitch // 2, pitch // 2)) == (
        255,
        255,
        255,
        255,
    )


def test_backend_csv_matches_frontend_schema_byte_for_byte() -> None:
    project = shared_golden_project()
    expected = (
        SHARED_FIXTURE_DIRECTORY / "export-parity.csv"
    ).read_bytes()

    content, media_type, _ = create_pattern_export(
        export_request(project, format_name="csv")
    )

    assert media_type == "text/csv; charset=utf-8"
    assert content == expected
    customer_text = content.decode("utf-8-sig")
    assert not re.search(
        r"schema|revision|matrixVersion|项目版本|矩阵版本|颜色 ID|显示 HEX",
        customer_text,
        flags=re.IGNORECASE,
    )


def test_customer_text_models_are_chinese_and_exclude_old_export_terms() -> None:
    project = multi_board_project()
    plan = pattern_export._plan_pdf_document(project)
    png_text = pattern_export._annotated_png_text(project)
    summary_text = pattern_export._pdf_summary_text(plan)
    board_text = pattern_export._pdf_board_text(
        project,
        plan,
        plan.boards[0],
    )
    visible_text = "\n".join(
        (
            *png_text.lines,
            *summary_text.lines,
            *board_text.lines,
        )
    )

    assert "图案：5 列 × 3 行" in visible_text
    assert "拼豆总数：8 颗" in visible_text
    assert "第1列" in png_text.column_labels
    assert "第1行" in png_text.row_labels
    assert "材料清单" in visible_text
    assert "打印比例：" in visible_text
    assert "第 2 页，共 5 页" in visible_text
    assert "第 1 行第 1 块拼板" in visible_text
    assert not re.search(
        (
            r"revision|schema|matrixVersion|Pattern|Board|Page|"
            r"Beads|Blank|legend|columns|rows|DPI"
        ),
        visible_text,
        flags=re.IGNORECASE,
    )


def test_all_annotated_png_and_pdf_text_uses_the_cjk_font_loader(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    project = two_cell_project()

    def reject_default_font(*_args: object, **_kwargs: object) -> None:
        pytest.fail("visible export text must not use Pillow's default font")

    monkeypatch.setattr(
        pattern_export.ImageFont,
        "load_default",
        reject_default_font,
    )

    png_content, _, _ = create_pattern_export(
        export_request(project, format_name="png")
    )
    pdf_content, _, _ = create_pattern_export(
        export_request(project, format_name="pdf")
    )

    assert png_content.startswith(b"\x89PNG")
    assert pdf_content.startswith(b"%PDF")


def test_cjk_font_resolver_has_a_stable_chinese_failure(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    resolver = pattern_export._resolve_cjk_font_path
    resolver.cache_clear()
    monkeypatch.setattr(pattern_export, "_CJK_FONT_CANDIDATES", ())

    try:
        with pytest.raises(ApiError) as error:
            resolver()
    finally:
        resolver.cache_clear()

    assert error.value.status_code == 500
    assert error.value.code == "EXPORT_CJK_FONT_UNAVAILABLE"
    assert error.value.message == (
        "未找到可用的中文字体，无法生成带文字的导出文件。"
    )


@pytest.mark.parametrize(
    ("available_path", "expected_index"),
    (
        ("/System/Library/Fonts/STHeiti Light.ttc", 1),
        (
            "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
            2,
        ),
    ),
)
def test_cjk_font_loader_uses_the_configured_platform_face(
    monkeypatch: pytest.MonkeyPatch,
    available_path: str,
    expected_index: int,
) -> None:
    calls: list[tuple[str, int, int]] = []
    sentinel = object()

    monkeypatch.setattr(
        Path,
        "is_file",
        lambda path: str(path) == available_path,
    )

    def record_truetype(
        path: str,
        *,
        size: int,
        index: int = 0,
    ) -> object:
        calls.append((path, size, index))
        return sentinel

    monkeypatch.setattr(pattern_export.ImageFont, "truetype", record_truetype)
    pattern_export._resolve_cjk_font_path.cache_clear()
    try:
        loaded = pattern_export._load_cjk_font(18)
    finally:
        pattern_export._resolve_cjk_font_path.cache_clear()

    assert loaded is sentinel
    assert calls == [
        (available_path, 12, expected_index),
        (available_path, 18, expected_index),
    ]


def test_resolved_cjk_font_reports_the_configured_chinese_face() -> None:
    candidate = pattern_export._resolve_cjk_font_path()
    expected_faces = {
        "/System/Library/Fonts/STHeiti Light.ttc": (
            "Heiti SC",
            "Light",
        ),
        "/System/Library/Fonts/STHeiti Medium.ttc": (
            "Heiti SC",
            "Medium",
        ),
        "/System/Library/Fonts/Supplemental/Arial Unicode.ttf": (
            "Arial Unicode MS",
            "Regular",
        ),
        "/Library/Fonts/Arial Unicode.ttf": (
            "Arial Unicode MS",
            "Regular",
        ),
        "/usr/share/fonts/opentype/noto/NotoSansCJKsc-Regular.otf": (
            "Noto Sans CJK SC",
            "Regular",
        ),
        "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc": (
            "Noto Sans CJK SC",
            "Regular",
        ),
    }

    assert pattern_export._load_cjk_font(12).getname() == expected_faces[
        candidate.path
    ]


def test_pdf_plan_has_summary_and_one_complete_page_per_board() -> None:
    project = multi_board_project()
    planner = getattr(pattern_export, "_plan_pdf_document", None)
    assert planner is not None

    plan = planner(project)

    assert plan.page_count == 5
    assert plan.summary.revision == project.revision
    assert plan.summary.rows == 3
    assert plan.summary.columns == 5
    assert plan.summary.non_empty_bead_count == 8
    assert plan.summary.blank_count == 7
    assert plan.summary.used_color_count == 1
    assert plan.summary.width_mm == 25.0
    assert plan.summary.height_mm == 15.0
    assert plan.summary.board_rows == 2
    assert plan.summary.board_columns == 3
    assert plan.summary.board_layout_rows == 2
    assert plan.summary.board_layout_columns == 2
    assert [
        (
            board.board_id,
            board.page_number,
            board.row_start,
            board.row_end,
            board.column_start,
            board.column_end,
        )
        for board in plan.boards
    ] == [
        ("B1-1", 2, 1, 2, 1, 3),
        ("B1-2", 3, 1, 2, 4, 5),
        ("B2-1", 4, 3, 3, 1, 3),
        ("B2-2", 5, 3, 3, 4, 5),
    ]
    assert all(0 < board.scale <= 1 for board in plan.boards)
    assert sum(board.non_empty_bead_count for board in plan.boards) == 8
    assert sum(board.blank_count for board in plan.boards) == 7
    assert all(board.per_color_counts for board in plan.boards)


def test_pdf_budget_rejects_oversized_layout_before_statistics(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    project = custom_board_project(rows=23, columns=23, board_rows=1, board_columns=1)
    monkeypatch.setattr(
        pattern_export,
        "_statistics",
        lambda _project: pytest.fail("statistics must not run before the PDF budget check"),
    )

    with pytest.raises(ApiError) as error:
        pattern_export._plan_pdf_document(project)

    assert error.value.status_code == 422
    assert error.value.code == "PDF_EXPORT_LIMIT_EXCEEDED"
    assert "500" in error.value.message
    assert any("\u4e00" <= character <= "\u9fff" for character in error.value.message)


def test_pdf_budget_enforces_total_raster_pixels(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    project = multi_board_project()
    monkeypatch.setattr(limits, "MAX_PDF_RASTER_PIXELS", 1)

    with pytest.raises(ApiError) as error:
        pattern_export._plan_pdf_document(project)

    assert error.value.code == "PDF_EXPORT_LIMIT_EXCEEDED"


def test_pdf_limits_are_owned_by_capabilities_contract() -> None:
    assert limits.MAX_PDF_PAGES == 500
    assert limits.MAX_PDF_RASTER_PIXELS == 1_100_000_000
    assert limits.PDF_PRODUCTION_CONTRACT["maximumPages"] == 500
    assert (
        limits.PDF_PRODUCTION_CONTRACT["maximumRasterPixels"]
        == 1_100_000_000
    )


def test_pdf_customer_text_has_print_readable_font_sizes() -> None:
    pixels_to_points = 72 / pattern_export.PDF_DPI

    assert (
        pattern_export.PDF_SUMMARY_HEADING_FONT_SIZE * pixels_to_points
        >= 14
    )
    assert (
        pattern_export.PDF_SUMMARY_BODY_FONT_SIZE * pixels_to_points
        >= 9
    )
    assert (
        pattern_export.PDF_BOARD_HEADING_FONT_SIZE * pixels_to_points
        >= 12
    )
    assert (
        pattern_export.PDF_BOARD_BODY_FONT_SIZE * pixels_to_points
        >= 8
    )
    assert (
        pattern_export.PDF_COORDINATE_FONT_SIZE * pixels_to_points
        >= 6.5
    )


def test_maximum_color_pdf_legends_fit_without_collision_or_overflow() -> None:
    project = maximum_color_project()
    plan = pattern_export._plan_pdf_document(project)
    layout_legend = getattr(pattern_export, "_layout_pdf_legend", None)
    summary_box_factory = getattr(
        pattern_export,
        "_pdf_summary_legend_box",
        None,
    )
    board_box_factory = getattr(
        pattern_export,
        "_pdf_board_legend_box",
        None,
    )

    assert callable(layout_legend)
    assert callable(summary_box_factory)
    assert callable(board_box_factory)
    assert plan.summary.used_color_count == 221
    assert len(plan.boards) == 1
    assert len(plan.boards[0].per_color_counts) == 221

    summary_font = pattern_export._load_cjk_font(
        pattern_export.PDF_SUMMARY_BODY_FONT_SIZE
    )
    board_font = pattern_export._load_cjk_font(
        pattern_export.PDF_BOARD_BODY_FONT_SIZE
    )
    summary_box = summary_box_factory()
    board_box = board_box_factory(plan.boards[0])
    summary_layout = layout_legend(
        plan.summary.per_color_counts,
        summary_box,
        summary_font,
        include_palette=True,
    )
    board_layout = layout_legend(
        plan.boards[0].per_color_counts,
        board_box,
        board_font,
        include_palette=False,
    )

    assert len(summary_layout.items) == 221
    assert len(board_layout.items) == 221
    assert_legend_layout_fits(summary_layout, summary_box, summary_font)
    assert_legend_layout_fits(board_layout, board_box, board_font)


def test_pdf_coordinates_clear_grid_legend_and_each_other_at_ordinary_pitch(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    project = custom_board_project(
        rows=29,
        columns=29,
        board_rows=29,
        board_columns=29,
    )
    plan = pattern_export._plan_pdf_document(project)
    board = plan.boards[0]

    calls, page_size = capture_rendered_coordinates(
        monkeypatch,
        lambda: pattern_export._render_pdf_board_page(
            project,
            plan,
            board,
        ),
    )

    assert project.grid.bead_pitch_mm == 5
    assert plan.page_count == 2
    assert {"第1列", "第29列", "第1行", "第29行"} <= {
        call[0] for call in calls
    }
    assert_pdf_coordinate_geometry(
        calls,
        page_size,
        project,
        board,
    )


def test_maximum_color_pdf_coordinates_clear_grid_legend_and_each_other(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    project = maximum_color_project()
    plan = pattern_export._plan_pdf_document(project)
    board = plan.boards[0]

    calls, page_size = capture_rendered_coordinates(
        monkeypatch,
        lambda: pattern_export._render_pdf_board_page(
            project,
            plan,
            board,
        ),
    )

    assert plan.summary.used_color_count == 221
    assert plan.page_count == 2
    assert {"第1列", "第15列", "第1行", "第15行"} <= {
        call[0] for call in calls
    }
    assert_pdf_coordinate_geometry(
        calls,
        page_size,
        project,
        board,
    )


@pytest.mark.parametrize(
    ("rows", "columns", "expected_labels"),
    (
        (1, 2, {"第1列", "第2列", "第1行"}),
        (2, 1, {"第1列", "第1行", "第2行"}),
    ),
)
def test_annotated_png_boundary_coordinates_do_not_collide(
    monkeypatch: pytest.MonkeyPatch,
    rows: int,
    columns: int,
    expected_labels: set[str],
) -> None:
    project = custom_board_project(
        rows=rows,
        columns=columns,
        board_rows=rows,
        board_columns=columns,
    )

    calls, image_size = capture_rendered_coordinates(
        monkeypatch,
        lambda: pattern_export._render_annotated_pattern_image(project),
    )
    grid_box = (
        LABEL_MARGIN,
        LABEL_MARGIN,
        LABEL_MARGIN + columns * CELL_SIZE,
        LABEL_MARGIN + rows * CELL_SIZE,
    )
    legend_left = LABEL_MARGIN + columns * CELL_SIZE + 24
    legend_box = (legend_left, 0, image_size[0], image_size[1])

    assert {call[0] for call in calls} == expected_labels
    assert_coordinate_geometry(
        calls,
        image_size,
        grid_box,
        legend_box,
    )


def test_pdf_budget_failure_occurs_before_render_and_leaves_no_output(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    project = custom_board_project(
        rows=23,
        columns=23,
        board_rows=1,
        board_columns=1,
    )
    monkeypatch.setattr(
        pattern_export,
        "_render_pdf_summary_page",
        lambda *_args: pytest.fail("budget failure must precede rendering"),
    )
    monkeypatch.setattr(
        pattern_export,
        "_render_pdf_board_page",
        lambda *_args: pytest.fail("budget failure must precede rendering"),
    )

    with pytest.raises(ApiError) as error:
        create_pattern_export(export_request(project, format_name="pdf"))

    assert error.value.code == "PDF_EXPORT_LIMIT_EXCEEDED"


def test_pdf_budget_allows_maximum_matrix_with_small_square_preset() -> None:
    board_layout_rows = math.ceil(300 / 14)
    board_layout_columns = math.ceil(300 / 14)

    pattern_export._validate_pdf_export_budget(
        board_layout_rows,
        board_layout_columns,
    )


def test_pdf_renderer_releases_each_page_before_rendering_the_next(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    project = multi_board_project()
    live_pages = 0
    maximum_live_pages = 0
    append_flags: list[bool] = []

    class RecordingPage:
        def __init__(self) -> None:
            nonlocal live_pages, maximum_live_pages
            live_pages += 1
            maximum_live_pages = max(maximum_live_pages, live_pages)

        def save(self, output: io.BytesIO, **options: object) -> None:
            append_flags.append(bool(options.get("append", False)))
            output.write(b"%PDF" if not append_flags[-1] else b"-page")

        def close(self) -> None:
            nonlocal live_pages
            live_pages -= 1

    monkeypatch.setattr(
        pattern_export,
        "_render_pdf_summary_page",
        lambda _project, _plan: RecordingPage(),
    )
    monkeypatch.setattr(
        pattern_export,
        "_render_pdf_board_page",
        lambda _project, _plan, _board: RecordingPage(),
    )

    content = pattern_export._render_pdf(project)

    assert content.startswith(b"%PDF")
    assert maximum_live_pages == 1
    assert live_pages == 0
    assert append_flags == [False, True, True, True, True]


def test_pdf_output_is_a4_multipage_document() -> None:
    project = multi_board_project()

    content, media_type, _ = create_pattern_export(
        export_request(project, format_name="pdf")
    )

    assert media_type == "application/pdf"
    assert content.startswith(b"%PDF")
    assert _pdf_page_count(content) == 5


def multi_board_project() -> BeadProject:
    payload = project_payload()
    selected_color = color_id("default")
    payload["grid"].update(
        {
            "rows": 3,
            "columns": 5,
            "boardPresetId": "custom",
            "boardRows": 2,
            "boardColumns": 3,
        }
    )
    payload["cells"] = [
        [
            (
                {"kind": "bead", "colorId": selected_color}
                if (row + column) % 2 == 0
                else {"kind": "empty"}
            )
            for column in range(5)
        ]
        for row in range(3)
    ]
    return BeadProject.model_validate(payload)


def custom_board_project(
    *, rows: int, columns: int, board_rows: int, board_columns: int
) -> BeadProject:
    payload = project_payload()
    payload["grid"].update(
        {
            "rows": rows,
            "columns": columns,
            "boardPresetId": "custom",
            "boardRows": board_rows,
            "boardColumns": board_columns,
        }
    )
    payload["cells"] = [
        [{"kind": "empty"} for _column in range(columns)] for _row in range(rows)
    ]
    return BeadProject.model_validate(payload)


def maximum_color_project() -> BeadProject:
    payload = project_payload()
    color_ids = [
        color["id"]
        for color in PALETTE_COLORS
        if color["paletteId"] == "mard"
    ]
    rows = 15
    columns = 15
    payload["source"].update(
        {
            "naturalWidth": columns,
            "naturalHeight": rows,
            "crop": {
                "x": 0,
                "y": 0,
                "width": columns,
                "height": rows,
            },
        }
    )
    payload["grid"].update(
        {
            "rows": rows,
            "columns": columns,
            "boardPresetId": "custom",
            "boardRows": rows,
            "boardColumns": columns,
        }
    )
    payload["palette"].update(
        {
            "paletteId": "mard",
            "availableColorIds": color_ids,
            "maximumColors": None,
        }
    )
    payload["cells"] = [
        [
            (
                {
                    "kind": "bead",
                    "colorId": color_ids[row * columns + column],
                }
                if row * columns + column < len(color_ids)
                else {"kind": "empty"}
            )
            for column in range(columns)
        ]
        for row in range(rows)
    ]
    return BeadProject.model_validate(payload)


def assert_legend_layout_fits(
    layout: pattern_export.PdfLegendLayout,
    box: tuple[int, int, int, int],
    font: ImageFont.ImageFont,
) -> None:
    image = Image.new("RGB", (1, 1))
    draw = ImageDraw.Draw(image)
    occupied_boxes: list[tuple[int, int, int, int]] = []

    for item in layout.items:
        text_box = draw.textbbox(
            item.text_position,
            item.label,
            font=font,
            anchor="lt",
        )
        occupied = (
            min(item.swatch_box[0], text_box[0]),
            min(item.swatch_box[1], text_box[1]),
            max(item.swatch_box[2], text_box[2]),
            max(item.swatch_box[3], text_box[3]),
        )
        assert box[0] <= occupied[0] < occupied[2] <= box[2]
        assert box[1] <= occupied[1] < occupied[3] <= box[3]
        occupied_boxes.append(occupied)

    for index, left in enumerate(occupied_boxes):
        for right in occupied_boxes[index + 1 :]:
            assert not (
                left[0] < right[2]
                and right[0] < left[2]
                and left[1] < right[3]
                and right[1] < left[3]
            )


CoordinateCall = tuple[
    str,
    tuple[float, float],
    str,
    ImageFont.FreeTypeFont,
]


def capture_rendered_coordinates(
    monkeypatch: pytest.MonkeyPatch,
    render: Callable[[], Image.Image],
) -> tuple[list[CoordinateCall], tuple[int, int]]:
    calls: list[CoordinateCall] = []
    original_text = ImageDraw.ImageDraw.text

    def record_text(
        draw: ImageDraw.ImageDraw,
        position: tuple[float, float],
        text: str,
        *args: object,
        **kwargs: object,
    ) -> None:
        font = kwargs.get("font")
        anchor = kwargs.get("anchor")
        if re.fullmatch(r"第\d+(?:行|列)", text):
            assert isinstance(font, ImageFont.FreeTypeFont)
            assert isinstance(anchor, str)
            calls.append((text, position, anchor, font))
        original_text(draw, position, text, *args, **kwargs)

    monkeypatch.setattr(ImageDraw.ImageDraw, "text", record_text)
    image = render()
    try:
        return calls, image.size
    finally:
        image.close()


def assert_pdf_coordinate_geometry(
    calls: list[CoordinateCall],
    page_size: tuple[int, int],
    project: BeadProject,
    board: pattern_export.PdfBoardPage,
) -> None:
    pixels_per_mm = pattern_export.PDF_DPI / 25.4 * board.scale
    bead_diameter = project.grid.bead_diameter_mm * pixels_per_mm
    pitch = project.grid.bead_pitch_mm * pixels_per_mm
    origin_x = _test_mm_to_px(pattern_export.PDF_MARGIN_MM) + _test_mm_to_px(
        pattern_export.PDF_COORDINATE_GUTTER_MM
    )
    origin_y = _test_mm_to_px(
        pattern_export.PDF_MARGIN_MM
        + pattern_export.PDF_HEADER_MM
        + pattern_export.PDF_COORDINATE_GUTTER_MM
    )
    columns = board.column_end - board.column_start + 1
    rows = board.row_end - board.row_start + 1
    grid_box = (
        math.floor(origin_x),
        math.floor(origin_y),
        math.ceil(origin_x + bead_diameter + (columns - 1) * pitch),
        math.ceil(origin_y + bead_diameter + (rows - 1) * pitch),
    )
    legend_right = page_size[0] - _test_mm_to_px(
        pattern_export.PDF_MARGIN_MM
    )
    legend_box = (
        legend_right - _test_mm_to_px(board.legend_width_mm),
        _test_mm_to_px(
            pattern_export.PDF_MARGIN_MM + pattern_export.PDF_HEADER_MM
        ),
        legend_right,
        page_size[1],
    )

    assert_coordinate_geometry(
        calls,
        page_size,
        grid_box,
        legend_box,
    )


def assert_coordinate_geometry(
    calls: list[CoordinateCall],
    canvas_size: tuple[int, int],
    grid_box: tuple[int, int, int, int],
    legend_box: tuple[int, int, int, int],
) -> None:
    draw = ImageDraw.Draw(Image.new("RGB", (1, 1)))
    labelled_boxes = [
        (
            label,
            draw.textbbox(
                position,
                label,
                font=font,
                anchor=anchor,
            ),
        )
        for label, position, anchor, font in calls
    ]

    for label, box in labelled_boxes:
        assert 0 <= box[0] < box[2] <= canvas_size[0], label
        assert 0 <= box[1] < box[3] <= canvas_size[1], label
        assert not boxes_overlap(box, grid_box), (
            label,
            box,
            grid_box,
        )
        assert not boxes_overlap(box, legend_box), (
            label,
            box,
            legend_box,
        )

    for index, left in enumerate(labelled_boxes):
        for right in labelled_boxes[index + 1 :]:
            assert not boxes_overlap(left[1], right[1]), (
                left,
                right,
            )


def boxes_overlap(
    left: tuple[int, int, int, int],
    right: tuple[int, int, int, int],
) -> bool:
    return (
        left[0] < right[2]
        and right[0] < left[2]
        and left[1] < right[3]
        and right[1] < left[3]
    )


def _test_mm_to_px(value_mm: float) -> int:
    return round(value_mm * pattern_export.PDF_DPI / 25.4)


def _pdf_page_count(content: bytes) -> int:
    counts = [
        int(value)
        for value in re.findall(
            rb"/Type\s*/Pages\s*/Count\s+(\d+)",
            content,
        )
    ]
    assert counts
    return max(counts)
