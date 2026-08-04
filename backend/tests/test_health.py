import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from fastapi.routing import APIRoute

from app import background_removal
from app.main import app


def test_health_exposes_only_the_required_status(client: TestClient) -> None:
    response = client.get("/api/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
    assert response.headers["cache-control"] == "no-store"


def test_capabilities_reports_versioned_background_removal_as_unavailable_without_model(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    manifest_path = tmp_path / "background-removal-model.json"
    manifest_path.write_text(
        json.dumps(
            {
                "model": {
                    "expectedFilename": "missing.onnx",
                    "sizeBytes": 1,
                    "sha256": "0" * 64,
                }
            }
        ),
        encoding="utf-8",
    )
    monkeypatch.setattr(
        background_removal,
        "BACKGROUND_REMOVAL_RUNTIME",
        background_removal.BackgroundRemovalRuntime(manifest_path),
    )
    response = client.get("/api/capabilities")

    assert response.status_code == 200
    assert response.json()["backgroundRemoval"] == {
        "contractVersion": "1.0",
        "available": False,
        "outputMimeType": "image/png",
        "maximumDecodedPixels": 12_000_000,
        "maximumConcurrentInferences": 1,
        "unavailableReason": "MODEL_MISSING",
        "interactive": {
            "contractVersion": "1.0",
            "available": False,
            "refinement": "grabcut",
            "maximumStrokesPerRequest": 64,
            "maximumStrokePointsPerRequest": 8192,
            "minimumBrushRadiusPx": 1,
            "maximumBrushRadiusPx": 512,
        },
    }


def test_no_unrequested_api_routes_exist(client: TestClient) -> None:
    paths = {
        route.path for route in app.routes if isinstance(route, APIRoute)
    }

    assert paths == {
        "/api/capabilities",
        "/api/health",
        "/api/palettes",
        "/api/pattern/generate",
        "/api/pattern/export",
        "/api/image/remove-background",
        "/api/image/remove-background/mask",
        "/api/image/remove-background/refine",
        "/api/image/remove-background/apply",
        "/api/grid/detect",
        "/api/grid/mirror",
        "/api/xhs/extractions",
        "/api/xhs/extractions/{extraction_id}/images/{image_id}",
        "/api/xhs/extractions/{extraction_id}/download",
    }
