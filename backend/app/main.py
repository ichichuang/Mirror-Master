from __future__ import annotations

from pathlib import Path
from typing import Annotated

from fastapi import Body, FastAPI, File, Form, Request, UploadFile
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse, Response
from fastapi.staticfiles import StaticFiles

from .generated_brand import PRODUCT_NAME
from app.errors import ApiError
from app.generated_palettes import (
    PALETTE_COLORS,
    PALETTES,
    PALETTE_SOURCE_VERSION,
)
from app.models import PatternExportRequest
from app.pattern import create_pattern_project
from app.pattern_export import create_pattern_export
from app.service import create_detection_contract, create_mirror_png

app = FastAPI(
    title=f"{PRODUCT_NAME} Backend",
    debug=False,
    docs_url=None,
    redoc_url=None,
    openapi_url=None,
)


@app.middleware("http")
async def add_privacy_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["Cache-Control"] = "no-store"
    response.headers["X-Content-Type-Options"] = "nosniff"
    return response


@app.exception_handler(ApiError)
async def handle_api_error(
    _request: Request, error: ApiError
) -> JSONResponse:
    return JSONResponse(
        status_code=error.status_code,
        content=error.as_response(),
    )


@app.exception_handler(RequestValidationError)
async def handle_request_validation_error(
    _request: Request, _error: RequestValidationError
) -> JSONResponse:
    error = ApiError(
        422,
        "REQUEST_INVALID",
        "请求必须包含有效的图片文件、模式和接口所需 JSON 字段。",
    )
    return JSONResponse(status_code=error.status_code, content=error.as_response())


@app.get("/api/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/capabilities")
async def capabilities() -> dict[str, object]:
    return {
        "schemaVersions": ["1.0"],
        "paletteSourceVersion": PALETTE_SOURCE_VERSION,
        "upload": {
            "mimeTypes": ["image/png", "image/jpeg", "image/webp"],
            "maximumBytes": 20 * 1024 * 1024,
            "maximumDecodedPixels": 25_000_000,
        },
        "grid": {
            "minimumRows": 1,
            "maximumRows": 300,
            "minimumColumns": 1,
            "maximumColumns": 300,
        },
        "modes": ["photo", "pixelArt", "existingChart"],
        "sampling": ["average", "nearest"],
        "dithering": ["none", "floydSteinberg"],
        "exports": ["png", "pdf", "csv", "projectJson"],
        "gridMirrorAxes": ["horizontal", "vertical"],
    }


@app.get("/api/palettes")
async def palettes() -> dict[str, object]:
    return {
        "sourceVersion": PALETTE_SOURCE_VERSION,
        "palettes": PALETTES,
        "colors": PALETTE_COLORS,
    }


@app.post("/api/pattern/generate")
async def generate_pattern(
    file: Annotated[UploadFile, File()],
    settings: Annotated[str, Form()],
) -> JSONResponse:
    result = await create_pattern_project(file, settings)
    return JSONResponse(result.model_dump(by_alias=True))


@app.post("/api/pattern/export")
async def export_pattern(
    request: Annotated[PatternExportRequest, Body()],
) -> Response:
    content, media_type, file_name = create_pattern_export(request)
    return Response(
        content,
        media_type=media_type,
        headers={
            "Content-Disposition": f'attachment; filename="{file_name}"',
        },
    )


@app.post("/api/grid/mirror")
async def mirror_grid(
    file: Annotated[UploadFile, File()],
    contract: Annotated[str, Form()],
) -> Response:
    png_bytes = await create_mirror_png(file, contract)
    return Response(
        png_bytes,
        media_type="image/png",
        headers={
            "Content-Disposition": 'attachment; filename="mirrored.png"',
        },
    )


@app.post("/api/grid/detect")
async def detect_grid(
    file: Annotated[UploadFile, File()],
    mode: Annotated[str, Form()],
    rectangle: Annotated[str | None, Form()] = None,
) -> JSONResponse:
    contract = await create_detection_contract(file, mode, rectangle)
    return JSONResponse(contract.model_dump(by_alias=True))


FRONTEND_DIST = Path(__file__).resolve().parents[2] / "dist"
if FRONTEND_DIST.is_dir():
    app.mount(
        "/",
        StaticFiles(directory=FRONTEND_DIST, html=True),
        name="frontend",
    )
