import importlib.util
from pathlib import Path

from fastapi.testclient import TestClient
from fastapi.routing import APIRoute

from app.main import app


def test_health_exposes_only_the_required_status(client: TestClient) -> None:
    response = client.get("/api/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
    assert response.headers["cache-control"] == "no-store"


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
        "/api/grid/detect",
        "/api/grid/mirror",
    }


def test_vercel_entrypoint_reexports_existing_app() -> None:
    entrypoint = Path(__file__).resolve().parents[2] / "api" / "index.py"
    spec = importlib.util.spec_from_file_location(
        "mirror_master_vercel_entrypoint", entrypoint
    )
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)

    spec.loader.exec_module(module)

    assert module.app is app
