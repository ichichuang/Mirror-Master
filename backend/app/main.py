from __future__ import annotations

from pathlib import Path
from typing import Annotated

from fastapi import Body, FastAPI, File, Form, Request, UploadFile
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse, Response
from fastapi.staticfiles import StaticFiles

from app import limits
from app.background_removal import (
    create_background_removed_png,
    get_background_removal_capability,
)
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
        "contractVersion": limits.CAPABILITIES_CONTRACT_VERSION,
        "schemaVersions": list(limits.PROJECT_SCHEMA_VERSIONS),
        "paletteSourceVersion": PALETTE_SOURCE_VERSION,
        "upload": {
            "mimeTypes": list(limits.SUPPORTED_IMAGE_MIME_TYPES),
            "maximumBytes": limits.MAX_UPLOAD_BYTES,
            "maximumDecodedPixels": limits.MAX_DECODED_PIXELS,
        },
        "grid": {
            "minimumRows": limits.MIN_PATTERN_ROWS,
            "maximumRows": limits.MAX_PATTERN_ROWS,
            "minimumColumns": limits.MIN_PATTERN_COLUMNS,
            "maximumColumns": limits.MAX_PATTERN_COLUMNS,
        },
        "beads": {
            "minimumDiameterMm": limits.MIN_BEAD_DIAMETER_MM,
            "maximumDiameterMm": limits.MAX_BEAD_DIAMETER_MM,
            "minimumPitchMm": limits.MIN_BEAD_PITCH_MM,
            "maximumPitchMm": limits.MAX_BEAD_PITCH_MM,
            "pitchMustNotBeSmallerThanDiameter": True,
        },
        "boards": {
            "fixedPresets": {
                preset_id: {
                    "rows": rows,
                    "columns": columns,
                }
                for preset_id, (
                    rows,
                    columns,
                ) in limits.FIXED_BOARD_PRESETS.items()
            },
            "custom": {
                "minimumRows": limits.MIN_BOARD_ROWS,
                "maximumRows": limits.MAX_BOARD_ROWS,
                "minimumColumns": limits.MIN_BOARD_COLUMNS,
                "maximumColumns": limits.MAX_BOARD_COLUMNS,
            },
        },
        "modes": list(limits.PATTERN_MODES),
        "sampling": list(limits.SAMPLING_MODES),
        "dithering": list(limits.DITHERING_MODES),
        "exports": list(limits.EXPORT_FORMATS),
        "pngTemplates": list(limits.PNG_TEMPLATES),
        "pdf": limits.PDF_PRODUCTION_CONTRACT,
        "gridMirrorAxes": list(limits.GRID_MIRROR_AXES),
        "backgroundRemoval": get_background_removal_capability(),
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


@app.post("/api/image/remove-background")
async def remove_image_background(
    file: Annotated[UploadFile, File()],
) -> Response:
    return Response(
        await create_background_removed_png(file),
        media_type="image/png",
    )


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
            "X-Project-Revision": str(request.project.revision),
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
