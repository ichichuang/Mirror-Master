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
) -> dict[str, object]:
    return {
        "mode": "photo",
        "crop": {"x": 0, "y": 0, "width": width, "height": height},
        "rotation": 0,
        "rows": rows,
        "columns": columns,
        "aspectLocked": True,
        "beadDiameterMm": 5.0,
        "beadPitchMm": 5.0,
        "boardPresetId": "standardSquare",
        "paletteId": "default",
        "availableColorIds": available_color_ids
        or ["default:A01", "default:A04", "default:A06", "default:B01"],
        "maximumColors": maximum_colors,
        "sampling": sampling,
        "dithering": "none",
        "alphaEmptyThreshold": alpha_empty_threshold,
    }


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
    assert payload["schemaVersions"] == ["1.0"]
    assert payload["paletteSourceVersion"] == PALETTE_SOURCE_VERSION
    assert payload["grid"]["maximumRows"] == 300
    assert payload["gridMirrorAxes"] == ["horizontal", "vertical"]
    assert "projectJson" in payload["exports"]


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
                "includeGrid": True,
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
    csv_text = responses["csv"].content.decode("utf-8-sig")
    assert f"拼豆总数,{payload['statistics']['nonEmptyBeadCount']}" in csv_text
