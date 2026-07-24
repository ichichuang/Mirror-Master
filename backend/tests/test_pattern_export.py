from __future__ import annotations

import io
import math
import re

import pytest
from PIL import Image
from pydantic import ValidationError

from app import limits, pattern_export
from app.errors import ApiError
from app.generated_brand import PRODUCT_NAME
from app.generated_palettes import PALETTE_COLORS
from app.models import BeadProject, PatternExportRequest
from app.pattern_export import (
    CELL_SIZE,
    LABEL_MARGIN,
    create_pattern_export,
)
from test_pattern_contracts import color_id, project_payload


def two_cell_project() -> BeadProject:
    payload = project_payload()
    selected_color = color_id("default")
    payload["grid"].update({"rows": 1, "columns": 2})
    payload["cells"] = [
        [
            {"kind": "bead", "colorId": selected_color},
            {"kind": "empty"},
        ]
    ]
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
        color for color in PALETTE_COLORS if color["id"] == color_id("default")
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
    assert image.getpixel((legend_left + 7, 105))[:3] == tuple(
        bytes.fromhex(selected["displayHex"][1:])
    )
    assert any(
        pixel != background
        for pixel in image.crop(
            (LABEL_MARGIN, 0, LABEL_MARGIN + CELL_SIZE, LABEL_MARGIN)
        ).get_flattened_data()
    )


def test_backend_csv_matches_frontend_schema_byte_for_byte() -> None:
    project = two_cell_project()
    selected = next(
        color for color in PALETTE_COLORS if color["id"] == color_id("default")
    )
    rows = [
        [f"{PRODUCT_NAME}项目", project.id],
        ["项目版本", project.schema_version],
        ["矩阵版本", str(project.revision)],
        ["行", "1"],
        ["列", "2"],
        ["拼豆总数", "1"],
        ["空格数", "1"],
        [],
        ["材料清单"],
        ["颜色 ID", "色板", "系列", "色号", "显示 HEX", "名称", "数量"],
        [
            selected["id"],
            selected["paletteId"],
            selected["series"],
            selected["code"],
            selected["displayHex"],
            selected["name"] or "",
            "1",
        ],
        [],
        ["逐格明细"],
        ["行", "列", "类型", "颜色 ID", "色板", "系列", "色号"],
        [
            "1",
            "1",
            "拼豆",
            selected["id"],
            selected["paletteId"],
            selected["series"],
            selected["code"],
        ],
        ["1", "2", "空", "", "", "", ""],
    ]
    expected = (
        "\ufeff"
        + "\r\n".join(
            ",".join(_escape_frontend_csv_cell(str(value)) for value in row)
            for row in rows
        )
        + "\r\n"
    ).encode("utf-8")

    content, media_type, _ = create_pattern_export(
        export_request(project, format_name="csv")
    )

    assert media_type == "text/csv; charset=utf-8"
    assert content == expected


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


def _escape_frontend_csv_cell(value: str) -> str:
    if any(character in value for character in ('"', ",", "\r", "\n")):
        return '"' + value.replace('"', '""') + '"'
    return value
