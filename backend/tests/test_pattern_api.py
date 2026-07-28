from __future__ import annotations

import io
import json

from fastapi.testclient import TestClient
from PIL import Image

from app.generated_palettes import (
    PALETTE_COLORS,
    PALETTES,
    PALETTE_SOURCE_VERSION,
)
from conftest import assert_structured_chinese_error
from test_pattern_contracts import project_payload


def encode_png(image: Image.Image) -> bytes:
    output = io.BytesIO()
    image.save(output, format="PNG")
    return output.getvalue()


def generation_settings(
    *,
    width: int,
    height: int,
    rows: int,
    columns: int,
    sampling: str = "nearest",
    available_color_ids: list[str] | None = None,
    maximum_colors: int | None = None,
    alpha_empty_threshold: float = 0.1,
    color_boost: str | None = None,
) -> dict[str, object]:
    settings: dict[str, object] = {
        "mode": "photo",
        "crop": {"x": 0, "y": 0, "width": width, "height": height},
        "rotation": 0,
        "rows": rows,
        "columns": columns,
        "aspectLocked": True,
        "beadDiameterMm": 5.0,
        "beadPitchMm": 5.0,
        "boardPresetId": "standardSquare",
        "boardRows": 29,
        "boardColumns": 29,
        "paletteId": "default",
        "availableColorIds": available_color_ids
        or ["default:A01", "default:A04", "default:A06", "default:B01"],
        "maximumColors": maximum_colors,
        "sampling": sampling,
        "dithering": "none",
        "alphaEmptyThreshold": alpha_empty_threshold,
    }
    if color_boost is not None:
        settings["colorBoost"] = color_boost
    return settings


def post_generate(
    client: TestClient,
    image: Image.Image,
    settings: dict[str, object],
):
    return client.post(
        "/api/pattern/generate",
        files={"file": ("pattern.png", encode_png(image), "image/png")},
        data={"settings": json.dumps(settings)},
    )


def test_palette_assets_expose_exact_owner_counts(
    client: TestClient,
) -> None:
    response = client.get("/api/palettes")

    assert response.status_code == 200
    payload = response.json()
    assert payload["sourceVersion"] == PALETTE_SOURCE_VERSION
    counts = {
        palette["id"]: len(palette["colorIds"])
        for palette in payload["palettes"]
    }
    assert counts == {"default": 39, "mard": 221}
    assert len(payload["colors"]) == 260
    assert len({color["id"] for color in payload["colors"]}) == 260
    assert {palette["id"] for palette in PALETTES} == {
        "default",
        "mard",
    }
    assert len(PALETTE_COLORS) == 260


def test_capabilities_match_project_contract(client: TestClient) -> None:
    response = client.get("/api/capabilities")

    assert response.status_code == 200
    payload = response.json()
    assert payload["contractVersion"] == "1.0"
    assert payload["schemaVersions"] == ["1.0"]
    assert payload["paletteSourceVersion"] == PALETTE_SOURCE_VERSION
    assert payload["grid"]["maximumRows"] == 300
    assert payload["beads"] == {
        "minimumDiameterMm": 1.0,
        "maximumDiameterMm": 10.0,
        "minimumPitchMm": 1.0,
        "maximumPitchMm": 12.0,
        "pitchMustNotBeSmallerThanDiameter": True,
    }
    assert payload["boards"]["custom"] == {
        "minimumRows": 1,
        "maximumRows": 300,
        "minimumColumns": 1,
        "maximumColumns": 300,
    }
    assert payload["pngTemplates"] == ["pure", "annotated"]
    assert payload["pdf"] == {
        "pageSize": "A4",
        "summaryPage": True,
        "onePagePerBoard": True,
        "coordinates": True,
        "legends": True,
        "counts": True,
        "physicalScale": "fit-with-declared-scale",
        "maximumPages": 500,
        "maximumRasterPixels": 1_100_000_000,
    }
    assert payload["gridMirrorAxes"] == ["horizontal", "vertical"]
    assert payload["exports"] == ["png", "pdf", "csv", "projectJson"]


def test_generation_is_deterministic_and_statistics_are_consistent(
    client: TestClient,
) -> None:
    image = Image.new("RGBA", (2, 2))
    image.putdata(
        [
            (255, 255, 255, 255),
            (0, 0, 0, 255),
            (227, 27, 35, 255),
            (128, 128, 128, 255),
        ]
    )
    settings = generation_settings(width=2, height=2, rows=2, columns=2)

    first = post_generate(client, image, settings)
    second = post_generate(client, image, settings)

    assert first.status_code == 200
    assert second.status_code == 200
    first_payload = first.json()
    second_payload = second.json()
    assert first_payload["project"]["cells"] == second_payload["project"]["cells"]
    statistics = first_payload["statistics"]
    assert sum(statistics["perColorCounts"].values()) == statistics[
        "nonEmptyBeadCount"
    ]
    assert (
        statistics["nonEmptyBeadCount"] + statistics["blankCount"]
        == statistics["totalCellCount"]
        == 4
    )


def test_transparency_creates_empty_cells(client: TestClient) -> None:
    image = Image.new("RGBA", (2, 1))
    image.putdata([(255, 255, 255, 255), (227, 27, 35, 0)])
    settings = generation_settings(width=2, height=1, rows=1, columns=2)

    response = post_generate(client, image, settings)

    assert response.status_code == 200
    cells = response.json()["project"]["cells"][0]
    assert cells[0]["kind"] == "bead"
    assert cells[1] == {"kind": "empty"}
    assert response.json()["statistics"]["blankCount"] == 1


def test_average_and_nearest_sampling_have_distinct_results(
    client: TestClient,
) -> None:
    image = Image.new("RGBA", (2, 1))
    image.putdata([(0, 0, 0, 255), (255, 255, 255, 255)])
    average = generation_settings(
        width=2,
        height=1,
        rows=1,
        columns=1,
        sampling="average",
        available_color_ids=[
            "default:A01",
            "default:A03",
            "default:A06",
        ],
    )
    nearest = {**average, "sampling": "nearest"}

    average_response = post_generate(client, image, average)
    nearest_response = post_generate(client, image, nearest)

    assert average_response.status_code == 200
    assert nearest_response.status_code == 200
    average_color = average_response.json()["project"]["cells"][0][0][
        "colorId"
    ]
    nearest_color = nearest_response.json()["project"]["cells"][0][0][
        "colorId"
    ]
    assert average_color == "default:A03"
    assert nearest_color == "default:A06"


def test_maximum_colors_uses_only_real_palette_colors(
    client: TestClient,
) -> None:
    image = Image.new("RGBA", (3, 1))
    image.putdata(
        [
            (255, 255, 255, 255),
            (0, 0, 0, 255),
            (227, 27, 35, 255),
        ]
    )
    settings = generation_settings(
        width=3,
        height=1,
        rows=1,
        columns=3,
        maximum_colors=1,
    )

    response = post_generate(client, image, settings)

    assert response.status_code == 200
    color_ids = {
        cell["colorId"]
        for cell in response.json()["project"]["cells"][0]
        if cell["kind"] == "bead"
    }
    assert len(color_ids) == 1
    assert color_ids <= set(settings["availableColorIds"])


def test_invalid_palette_settings_return_structured_chinese_error(
    client: TestClient,
) -> None:
    image = Image.new("RGBA", (1, 1), "white")
    settings = generation_settings(width=1, height=1, rows=1, columns=1)
    settings["availableColorIds"] = []

    response = post_generate(client, image, settings)

    assert_structured_chinese_error(
        response, "PATTERN_SETTINGS_INVALID"
    )


def make_colorful_image() -> Image.Image:
    image = Image.new("RGBA", (4, 4))
    image.putdata(
        [
            (
                (x * 37 + y * 11) % 256,
                (x * 17 + y * 53) % 256,
                (x * 73 + y * 29) % 256,
                255,
            )
            for y in range(4)
            for x in range(4)
        ]
    )
    return image


def test_color_boost_defaults_to_identical_matrix(
    client: TestClient,
) -> None:
    image = make_colorful_image()
    settings = generation_settings(
        width=4, height=4, rows=4, columns=4, sampling="average"
    )
    explicit_none = {**settings, "colorBoost": "none"}

    default_response = post_generate(client, image, settings)
    none_response = post_generate(client, image, explicit_none)

    assert default_response.status_code == 200
    assert none_response.status_code == 200
    assert (
        default_response.json()["project"]["cells"]
        == none_response.json()["project"]["cells"]
    )


def make_photographic_image(size: int = 16) -> Image.Image:
    image = Image.new("RGBA", (size, size))
    image.putdata(
        [
            (
                (60 + 8 * x + 3 * y) % 256,
                (100 + 5 * x + 9 * y) % 256,
                (140 + 11 * x + 2 * y) % 256,
                255,
            )
            for y in range(size)
            for x in range(size)
        ]
    )
    return image


def test_color_boost_vivid_is_deterministic_and_changes_colors(
    client: TestClient,
) -> None:
    image = make_photographic_image()
    all_default_colors = [
        color["id"]
        for color in PALETTE_COLORS
        if color["paletteId"] == "default"
    ]
    settings = generation_settings(
        width=16,
        height=16,
        rows=16,
        columns=16,
        sampling="average",
        available_color_ids=all_default_colors,
    )
    vivid = {**settings, "colorBoost": "vivid"}

    first = post_generate(client, image, vivid)
    second = post_generate(client, image, vivid)
    plain = post_generate(client, image, settings)

    assert first.status_code == 200
    assert second.status_code == 200
    assert plain.status_code == 200
    first_cells = first.json()["project"]["cells"]
    assert first_cells == second.json()["project"]["cells"]
    assert first_cells != plain.json()["project"]["cells"]


def test_color_boost_rejects_invalid_values(
    client: TestClient,
) -> None:
    image = make_colorful_image()
    settings = generation_settings(width=4, height=4, rows=4, columns=4)
    settings["colorBoost"] = "ultra"

    response = post_generate(client, image, settings)

    assert_structured_chinese_error(
        response, "PATTERN_SETTINGS_INVALID"
    )


def test_color_boost_vivid_keeps_transparent_cells_empty(
    client: TestClient,
) -> None:
    image = Image.new("RGBA", (2, 1))
    image.putdata([(200, 120, 60, 255), (227, 27, 35, 0)])
    settings = generation_settings(
        width=2, height=1, rows=1, columns=2, color_boost="vivid"
    )

    response = post_generate(client, image, settings)

    assert response.status_code == 200
    cells = response.json()["project"]["cells"][0]
    assert cells[0]["kind"] == "bead"
    assert cells[1] == {"kind": "empty"}
    assert response.json()["statistics"]["blankCount"] == 1


def test_png_pdf_csv_exports_use_the_same_project(
    client: TestClient,
) -> None:
    image = Image.new("RGBA", (2, 1))
    image.putdata([(255, 255, 255, 255), (0, 0, 0, 255)])
    generated = post_generate(
        client,
        image,
        generation_settings(width=2, height=1, rows=1, columns=2),
    )
    assert generated.status_code == 200
    payload = generated.json()
    project = payload["project"]

    responses = {
        format_name: client.post(
            "/api/pattern/export",
            json={
                "project": project,
                "format": format_name,
                "template": "annotated",
            },
        )
        for format_name in ("png", "pdf", "csv")
    }

    assert responses["png"].status_code == 200
    assert responses["png"].headers["content-type"] == "image/png"
    assert responses["png"].content.startswith(b"\x89PNG")
    assert responses["pdf"].status_code == 200
    assert responses["pdf"].headers["content-type"] == "application/pdf"
    assert responses["pdf"].content.startswith(b"%PDF")
    assert responses["csv"].status_code == 200
    assert responses["csv"].content.startswith(b"\xef\xbb\xbf")
    assert {
        response.headers["x-project-revision"]
        for response in responses.values()
    } == {str(project["revision"])}
    csv_text = responses["csv"].content.decode("utf-8-sig")
    assert f"拼豆总数,{payload['statistics']['nonEmptyBeadCount']}" in csv_text


def test_pdf_export_rejects_layout_over_the_published_budget(
    client: TestClient,
) -> None:
    project = project_payload()
    project["grid"].update(
        {
            "rows": 23,
            "columns": 23,
            "boardPresetId": "custom",
            "boardRows": 1,
            "boardColumns": 1,
        }
    )
    project["cells"] = [
        [{"kind": "empty"} for _column in range(23)] for _row in range(23)
    ]

    response = client.post(
        "/api/pattern/export",
        json={
            "project": project,
            "format": "pdf",
            "template": "annotated",
        },
    )

    assert_structured_chinese_error(
        response,
        "PDF_EXPORT_LIMIT_EXCEEDED",
    )
