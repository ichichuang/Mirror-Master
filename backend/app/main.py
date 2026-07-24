from __future__ import annotations

from pathlib import Path
from typing import Annotated

from fastapi import FastAPI, File, Form, Request, UploadFile
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse, Response
from fastapi.staticfiles import StaticFiles

from app import limits
from app.errors import ApiError
from app.service import create_detection_contract, create_mirror_png

app = FastAPI(
    title="Mirror Master Backend",
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


@app.middleware("http")
async def enforce_vercel_multipart_limit(request: Request, call_next):
    if (
        limits.is_vercel_runtime()
        and request.headers.get("content-type", "").lower().startswith(
            "multipart/form-data"
        )
    ):
        content_length = request.headers.get("content-length")
        try:
            request_size = int(content_length) if content_length else None
        except ValueError:
            request_size = None

        if request_size is None:
            error = ApiError(
                413,
                "VERCEL_MULTIPART_CONTENT_LENGTH_REQUIRED",
                "Vercel 部署要求 multipart 请求提供有效的 Content-Length，"
                "以便在平台 4.5 MB 限制前拒绝请求。",
            )
            return JSONResponse(
                status_code=error.status_code,
                content=error.as_response(),
                headers={
                    "Cache-Control": "no-store",
                    "X-Content-Type-Options": "nosniff",
                },
            )

        if request_size > limits.VERCEL_MAX_MULTIPART_REQUEST_BYTES:
            error = ApiError(
                413,
                "VERCEL_MULTIPART_REQUEST_TOO_LARGE",
                "Vercel 部署的 multipart 请求最多为 4 MiB；"
                "更大的图片请使用现有 VPS/Docker 部署。",
            )
            return JSONResponse(
                status_code=error.status_code,
                content=error.as_response(),
                headers={
                    "Cache-Control": "no-store",
                    "X-Content-Type-Options": "nosniff",
                },
            )

    return await call_next(request)


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
