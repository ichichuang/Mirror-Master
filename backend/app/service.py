from __future__ import annotations

import hashlib
import hmac
import io
import json
from typing import Any, Literal

from fastapi import UploadFile
from PIL import Image, ImageOps, UnidentifiedImageError
from pydantic import TypeAdapter, ValidationError

from app import limits
from app.detection import detect_grid
from app.errors import ApiError
from app.mirror import (
    mirror_cells,
    validate_grid_contract,
    validate_v2_candidate_authority,
)
from app.chart_detection.types import QuadTuple
from app.models import (
    DetectionRectangle,
    GridContract,
    GridContractV2,
    GridDetectionResultV2,
    GridPoint,
)

ALLOWED_IMAGE_FORMATS = {
    "image/jpeg": {"JPEG"},
    "image/png": {"PNG"},
    "image/webp": {"WEBP"},
}


def _reject_nonstandard_json_constant(value: str) -> None:
    raise ValueError(value)


def parse_contract(contract_text: str) -> GridContract | GridContractV2:
    try:
        encoded_size = len(contract_text.encode("utf-8"))
    except UnicodeEncodeError as error:
        raise ApiError(
            422,
            "GRID_CONTRACT_INVALID",
            "网格合同不是有效的 UTF-8 JSON。",
        ) from error

    if encoded_size > limits.MAX_CONTRACT_BYTES:
        raise ApiError(
            413,
            "GRID_CONTRACT_TOO_LARGE",
            "网格合同超过允许的大小。",
        )

    try:
        payload: Any = json.loads(
            contract_text, parse_constant=_reject_nonstandard_json_constant
        )
    except (json.JSONDecodeError, ValueError) as error:
        raise ApiError(
            422,
            "GRID_CONTRACT_INVALID",
            "网格合同不是有效的 JSON。",
        ) from error

    if not isinstance(payload, dict):
        raise ApiError(
            422,
            "GRID_CONTRACT_INVALID",
            "网格合同必须是 JSON 对象。",
        )

    if payload.get("confirmed") is not True:
        raise ApiError(
            422,
            "GRID_NOT_CONFIRMED",
            "网格合同必须由用户明确确认。",
        )

    contract_model = (
        GridContractV2
        if payload.get("contractVersion") == "2.0"
        else GridContract
    )
    try:
        return contract_model.model_validate(payload)
    except ValidationError as error:
        raise ApiError(
            422,
            "GRID_CONTRACT_INVALID",
            "网格合同字段缺失、类型错误或包含未允许字段。",
        ) from error


async def read_upload(upload: UploadFile) -> bytes:
    if upload.content_type not in ALLOWED_IMAGE_FORMATS:
        raise ApiError(
            415,
            "IMAGE_MIME_UNSUPPORTED",
            "仅支持 JPEG、PNG 或 WebP 图片。",
        )

    content = bytearray()
    while chunk := await upload.read(limits.UPLOAD_READ_CHUNK_BYTES):
        content.extend(chunk)
        if len(content) > limits.MAX_UPLOAD_BYTES:
            raise ApiError(
                413,
                "IMAGE_UPLOAD_TOO_LARGE",
                "上传图片超过允许的字节大小。",
            )

    if not content:
        raise ApiError(
            422,
            "IMAGE_EMPTY",
            "上传图片不能为空。",
        )
    return bytes(content)


def decode_normalized_rgba(
    image_bytes: bytes,
    declared_mime: str,
    *,
    maximum_decoded_pixels: int | None = None,
    pixel_error_code: str = "IMAGE_PIXEL_LIMIT_EXCEEDED",
    pixel_error_message: str = "解码后的图片像素数量超过允许上限。",
) -> Image.Image:
    pixel_limit = (
        limits.MAX_DECODED_PIXELS
        if maximum_decoded_pixels is None
        else maximum_decoded_pixels
    )
    try:
        with Image.open(io.BytesIO(image_bytes)) as decoded:
            if decoded.format not in ALLOWED_IMAGE_FORMATS[declared_mime]:
                raise ApiError(
                    415,
                    "IMAGE_MIME_MISMATCH",
                    "声明的图片类型与实际解码格式不一致。",
                )
            width, height = decoded.size
            if width * height > pixel_limit:
                raise ApiError(
                    413,
                    pixel_error_code,
                    pixel_error_message,
                )
            decoded.load()
            normalized = ImageOps.exif_transpose(decoded)
            return normalized.convert("RGBA")
    except ApiError:
        raise
    except (Image.DecompressionBombError, UnidentifiedImageError, OSError) as error:
        raise ApiError(
            422,
            "IMAGE_DECODE_FAILED",
            "上传内容无法解码为受支持的图片。",
        ) from error


def encode_png(image: Image.Image) -> bytes:
    output = io.BytesIO()
    image.save(output, format="PNG")
    return output.getvalue()


def _parse_rectangle(
    rectangle_text: str | None,
) -> DetectionRectangle | None:
    if rectangle_text is None or rectangle_text == "":
        return None
    try:
        payload: Any = json.loads(
            rectangle_text, parse_constant=_reject_nonstandard_json_constant
        )
    except (json.JSONDecodeError, ValueError) as error:
        raise ApiError(
            422,
            "GRID_RECTANGLE_INVALID",
            "手动选区不是有效的 JSON 半开整数矩形。",
        ) from error
    try:
        return DetectionRectangle.model_validate(payload)
    except ValidationError as error:
        raise ApiError(
            422,
            "GRID_RECTANGLE_INVALID",
            "手动选区必须只包含 left、top、right、bottom 四个整数。",
        ) from error


async def create_detection_contract(
    upload: UploadFile,
    mode_text: str,
    rectangle_text: str | None,
    quad_text: str | None = None,
    expected_columns_text: str | None = None,
    expected_rows_text: str | None = None,
) -> GridDetectionResultV2:
    try:
        if mode_text not in {"auto", "manual"}:
            raise ApiError(
                422,
                "GRID_DETECTION_MODE_INVALID",
                "识别模式必须是 auto 或 manual。",
            )
        mode: Literal["auto", "manual"] = mode_text
        rectangle = _parse_rectangle(rectangle_text)
        quad = _parse_quad(quad_text)
        expected_columns, expected_rows = _parse_expected_dimensions(
            expected_columns_text,
            expected_rows_text,
        )
        if mode == "auto" and (
            rectangle is not None
            or quad is not None
            or expected_columns is not None
        ):
            raise ApiError(
                422,
                "GRID_MANUAL_CONSTRAINTS_UNEXPECTED",
                "自动模式不接受手动选区或行列约束。",
            )
        if mode == "manual" and rectangle is None and quad is None:
            raise ApiError(
                422,
                "GRID_MANUAL_REGION_REQUIRED",
                "手动模式需要完整矩形或按顺序提供四个角点。",
            )
        if mode == "manual" and rectangle is not None and quad is not None:
            raise ApiError(
                422,
                "GRID_MANUAL_REGION_AMBIGUOUS",
                "手动模式只能提交矩形或四角选区中的一种。",
            )
        image_bytes = await read_upload(upload)
        image_sha256 = hashlib.sha256(image_bytes).hexdigest()
        source = decode_normalized_rgba(
            image_bytes, upload.content_type or ""
        )
        return detect_grid(
            source,
            image_sha256,
            mode,
            rectangle,
            quad=quad,
            expected_columns=expected_columns,
            expected_rows=expected_rows,
        )
    finally:
        await upload.close()


def _parse_quad(quad_text: str | None) -> QuadTuple | None:
    if quad_text is None or quad_text == "":
        return None
    try:
        payload: Any = json.loads(
            quad_text,
            parse_constant=_reject_nonstandard_json_constant,
        )
        points = TypeAdapter(list[GridPoint]).validate_python(
            payload,
            strict=True,
        )
    except (json.JSONDecodeError, ValueError, ValidationError) as error:
        raise ApiError(
            422,
            "GRID_QUAD_INVALID",
            "四角选区必须是按左上、右上、右下、左下排列的四个坐标点。",
        ) from error
    if len(points) != 4:
        raise ApiError(
            422,
            "GRID_QUAD_INVALID",
            "四角选区必须恰好包含四个坐标点。",
        )
    return tuple((point.x, point.y) for point in points)  # type: ignore[return-value]


def _parse_expected_dimensions(
    columns_text: str | None,
    rows_text: str | None,
) -> tuple[int | None, int | None]:
    if (columns_text in {None, ""}) != (rows_text in {None, ""}):
        raise ApiError(
            422,
            "GRID_EXPECTED_DIMENSIONS_INCOMPLETE",
            "实际列数和行数必须同时提供。",
        )
    if columns_text in {None, ""}:
        return None, None
    try:
        columns = int(columns_text)
        rows = int(rows_text or "")
    except ValueError as error:
        raise ApiError(
            422,
            "GRID_EXPECTED_DIMENSIONS_INVALID",
            "实际列数和行数必须是 2 到 300 的整数。",
        ) from error
    if (
        str(columns) != columns_text
        or str(rows) != rows_text
        or not (2 <= columns <= 300)
        or not (2 <= rows <= 300)
    ):
        raise ApiError(
            422,
            "GRID_EXPECTED_DIMENSIONS_INVALID",
            "实际列数和行数必须是 2 到 300 的整数。",
        )
    return columns, rows


async def create_mirror_png(
    upload: UploadFile, contract_text: str
) -> bytes:
    try:
        contract = parse_contract(contract_text)
        image_bytes = await read_upload(upload)
        actual_hash = hashlib.sha256(image_bytes).hexdigest()
        if not hmac.compare_digest(actual_hash, contract.image_sha256):
            raise ApiError(
                422,
                "GRID_IMAGE_HASH_MISMATCH",
                "网格合同与当前上传图片不匹配，可能已经过期。",
            )

        source = decode_normalized_rgba(
            image_bytes, upload.content_type or ""
        )
        validate_grid_contract(contract, source.size)
        if isinstance(contract, GridContractV2):
            validate_v2_candidate_authority(source, contract)
        return encode_png(mirror_cells(source, contract))
    finally:
        await upload.close()
