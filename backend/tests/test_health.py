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
        "/api/health",
        "/api/grid/detect",
        "/api/grid/mirror",
    }
