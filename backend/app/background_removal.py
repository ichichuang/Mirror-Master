from __future__ import annotations

import asyncio
import hashlib
import json
import os
import threading
from pathlib import Path
from typing import Callable, Literal, Protocol, TypedDict

from fastapi import UploadFile
from PIL import Image
from PIL.Image import Image as PillowImage
from starlette.concurrency import run_in_threadpool

from app import limits
from app.errors import ApiError
from app.service import decode_normalized_rgba, encode_png, read_upload

MODEL_MANIFEST_PATH = (
    Path(__file__).resolve().parents[1]
    / "models"
    / "background-removal-model.json"
)

UnavailableReason = Literal[
    "MODEL_MISSING",
    "MODEL_INVALID",
    "ENGINE_INITIALIZATION_FAILED",
]


class BackgroundRemovalInteractiveCapability(TypedDict):
    contractVersion: str
    available: bool
    refinement: str
    maximumStrokesPerRequest: int
    maximumStrokePointsPerRequest: int
    minimumBrushRadiusPx: int
    maximumBrushRadiusPx: int


class BackgroundRemovalCapability(TypedDict):
    contractVersion: str
    available: bool
    outputMimeType: str
    maximumDecodedPixels: int
    maximumConcurrentInferences: int
    unavailableReason: UnavailableReason | None
    interactive: BackgroundRemovalInteractiveCapability


class BackgroundRemovalUnavailableError(Exception):
    pass


class BackgroundRemovalEngine(Protocol):
    def remove(self, source: PillowImage) -> PillowImage: ...
    def mask(self, source: PillowImage) -> PillowImage: ...


SessionFactory = Callable[[Path], object]
RembgRemover = Callable[..., PillowImage]
EngineFactory = Callable[[Path], BackgroundRemovalEngine]


class RembgBackgroundRemovalEngine:
    def __init__(
        self,
        model_path: Path,
        *,
        session_factory: SessionFactory | None = None,
        remover: RembgRemover | None = None,
    ) -> None:
        self._session = (
            session_factory or _create_project_local_rembg_session
        )(model_path)
        self._remover = remover or _remove_with_rembg

    def remove(self, source: PillowImage) -> PillowImage:
        result = self._remover(source, session=self._session)
        if not isinstance(result, PillowImage):
            raise TypeError("background removal did not return an image")
        if result.mode == "RGBA":
            return result
        try:
            return result.convert("RGBA")
        finally:
            result.close()

    def mask(self, source: PillowImage) -> PillowImage:
        from rembg import remove

        result = remove(source, session=self._session, only_mask=True)
        if not isinstance(result, PillowImage):
            raise TypeError("background removal did not return a mask")
        if result.mode == "L":
            return result
        try:
            return result.convert("L")
        finally:
            result.close()


class BackgroundRemovalRuntime:
    def __init__(
        self,
        manifest_path: Path,
        *,
        engine_factory: EngineFactory = RembgBackgroundRemovalEngine,
    ) -> None:
        self._manifest_path = manifest_path
        self._engine_factory = engine_factory
        self._engine: BackgroundRemovalEngine | None = None
        self._initialization_failed = False
        self._lock = threading.Lock()

    def capability(self) -> BackgroundRemovalCapability:
        reason: UnavailableReason | None
        if self._initialization_failed:
            reason = "ENGINE_INITIALIZATION_FAILED"
        else:
            _, reason = _validated_model_path(self._manifest_path)
        return _capability(reason)

    def remove(self, source: PillowImage) -> PillowImage:
        return self._engine_or_raise().remove(source)

    def mask(self, source: PillowImage) -> PillowImage:
        return self._engine_or_raise().mask(source)

    def _engine_or_raise(self) -> BackgroundRemovalEngine:
        engine = self._engine
        if engine is None:
            with self._lock:
                engine = self._engine
                if engine is None:
                    if self._initialization_failed:
                        raise BackgroundRemovalUnavailableError(
                            "ENGINE_INITIALIZATION_FAILED"
                        )
                    model_path, reason = _validated_model_path(
                        self._manifest_path
                    )
                    if model_path is None:
                        raise BackgroundRemovalUnavailableError(reason)
                    try:
                        engine = self._engine_factory(model_path)
                    except Exception as error:
                        self._initialization_failed = True
                        raise BackgroundRemovalUnavailableError(
                            "ENGINE_INITIALIZATION_FAILED"
                        ) from error
                    self._engine = engine
        return engine


def _create_project_local_rembg_session(model_path: Path) -> object:
    import onnxruntime as ort
    from rembg.sessions.dis_general_use import DisSession

    class ProjectLocalDisSession(DisSession):
        @classmethod
        def download_models(cls, *_args, **_kwargs):
            return str(model_path)

    session_options = ort.SessionOptions()
    thread_count = int(
        os.getenv("BACKGROUND_REMOVAL_CPU_THREADS", "2")
    )
    if thread_count < 1:
        raise ValueError(
            "BACKGROUND_REMOVAL_CPU_THREADS must be positive"
        )
    session_options.execution_mode = ort.ExecutionMode.ORT_SEQUENTIAL
    session_options.inter_op_num_threads = 1
    session_options.intra_op_num_threads = thread_count
    session_options.enable_cpu_mem_arena = False
    session_options.enable_mem_pattern = False
    return ProjectLocalDisSession(
        "isnet-general-use",
        session_options,
        providers=["CPUExecutionProvider"],
    )


def _remove_with_rembg(
    source: PillowImage,
    *,
    session: object,
) -> PillowImage:
    from rembg import remove

    result = remove(source, session=session)
    if not isinstance(result, PillowImage):
        raise TypeError("rembg did not return a Pillow image")
    return result


BACKGROUND_REMOVAL_RUNTIME = BackgroundRemovalRuntime(
    MODEL_MANIFEST_PATH
)
_BACKGROUND_REMOVAL_SEMAPHORE = asyncio.Semaphore(
    limits.MAX_BACKGROUND_REMOVAL_CONCURRENCY
)


def _capability(
    reason: UnavailableReason | None,
) -> BackgroundRemovalCapability:
    return {
        "contractVersion": limits.BACKGROUND_REMOVAL_CONTRACT_VERSION,
        "available": reason is None,
        "outputMimeType": "image/png",
        "maximumDecodedPixels": (
            limits.MAX_BACKGROUND_REMOVAL_DECODED_PIXELS
        ),
        "maximumConcurrentInferences": (
            limits.MAX_BACKGROUND_REMOVAL_CONCURRENCY
        ),
        "unavailableReason": reason,
        "interactive": {
            "contractVersion": (
                limits.BACKGROUND_REMOVAL_INTERACTIVE_CONTRACT_VERSION
            ),
            "available": reason is None,
            "refinement": "grabcut",
            "maximumStrokesPerRequest": (
                limits.MAX_MASK_REFINE_STROKES
            ),
            "maximumStrokePointsPerRequest": (
                limits.MAX_MASK_REFINE_POINTS
            ),
            "minimumBrushRadiusPx": limits.MIN_MASK_BRUSH_RADIUS_PX,
            "maximumBrushRadiusPx": limits.MAX_MASK_BRUSH_RADIUS_PX,
        },
    }


def get_background_removal_capability() -> BackgroundRemovalCapability:
    runtime = BACKGROUND_REMOVAL_RUNTIME
    if isinstance(runtime, BackgroundRemovalRuntime):
        return runtime.capability()
    return _capability(None)


def _validated_model_path(
    manifest_path: Path,
) -> tuple[Path | None, UnavailableReason | None]:
    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        model = manifest["model"]
        model_path = manifest_path.parent / model["expectedFilename"]
        expected_size = model["sizeBytes"]
        expected_sha256 = model["sha256"]
        if not model_path.is_file():
            return None, "MODEL_MISSING"
        if model_path.stat().st_size != expected_size:
            return None, "MODEL_INVALID"
        with model_path.open("rb") as model_file:
            actual_sha256 = hashlib.file_digest(
                model_file, "sha256"
            ).hexdigest()
        if actual_sha256 != expected_sha256:
            return None, "MODEL_INVALID"
    except (KeyError, OSError, TypeError, ValueError, json.JSONDecodeError):
        return None, "MODEL_INVALID"
    return model_path, None


def _model_unavailable_reason(
    manifest_path: Path,
) -> UnavailableReason | None:
    _, reason = _validated_model_path(manifest_path)
    return reason


async def create_background_removed_png(upload: UploadFile) -> bytes:
    source: Image.Image | None = None
    result: Image.Image | None = None
    try:
        image_bytes = await read_upload(upload)
        source = decode_normalized_rgba(
            image_bytes,
            upload.content_type or "",
            maximum_decoded_pixels=(
                limits.MAX_BACKGROUND_REMOVAL_DECODED_PIXELS
            ),
            pixel_error_code=(
                "BACKGROUND_REMOVAL_PIXEL_LIMIT_EXCEEDED"
            ),
            pixel_error_message=(
                "图片像素过多，无法安全执行一键去背景。请缩小图片后重试。"
            ),
        )
        async with _BACKGROUND_REMOVAL_SEMAPHORE:
            result = await run_in_threadpool(
                BACKGROUND_REMOVAL_RUNTIME.remove,
                source,
            )
        if result.size != source.size:
            raise RuntimeError("background removal changed dimensions")
        rgba_result = (
            result if result.mode == "RGBA" else result.convert("RGBA")
        )
        try:
            return encode_png(rgba_result)
        finally:
            if rgba_result is not result:
                rgba_result.close()
    except ApiError:
        raise
    except BackgroundRemovalUnavailableError as error:
        raise ApiError(
            503,
            "BACKGROUND_REMOVAL_UNAVAILABLE",
            "一键去背景当前不可用。请联系服务维护者安装模型后重试。",
        ) from error
    except Exception as error:
        raise ApiError(
            500,
            "BACKGROUND_REMOVAL_FAILED",
            "无法完成一键去背景。原图和当前图纸已保留，请稍后重试。",
        ) from error
    finally:
        if result is not None and result is not source:
            result.close()
        if source is not None:
            source.close()
        await upload.close()
