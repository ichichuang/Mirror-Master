from __future__ import annotations

import hashlib
import hmac
import io
import json
from typing import Any

from fastapi import UploadFile
from PIL import Image, ImageOps, UnidentifiedImageError
from pydantic import ValidationError

from app import limits
from app.errors import ApiError
from app.mirror import mirror_cells, validate_grid_contract
from app.models import GridContract

ALLOWED_IMAGE_FORMATS = {
    "image/jpeg": {"JPEG"},
    "image/png": {"PNG"},
    "image/webp": {"WEBP"},
}


def _reject_nonstandard_json_constant(value: str) -> None:
    raise ValueError(value)


def parse_contract(contract_text: str) -> GridContract:
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

    try:
        return GridContract.model_validate(payload)
    except ValidationError as error:
        raise ApiError(
            422,
            "GRID_CONTRACT_INVALID",
            "网格合同字段缺失、类型错误或包含未允许字段。",
        ) from error


async def _read_upload(upload: UploadFile) -> bytes:
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


def _decode_normalized_rgba(
    image_bytes: bytes, declared_mime: str
) -> Image.Image:
    try:
        with Image.open(io.BytesIO(image_bytes)) as decoded:
            if decoded.format not in ALLOWED_IMAGE_FORMATS[declared_mime]:
                raise ApiError(
                    415,
                    "IMAGE_MIME_MISMATCH",
                    "声明的图片类型与实际解码格式不一致。",
                )
            width, height = decoded.size
            if width * height > limits.MAX_DECODED_PIXELS:
                raise ApiError(
                    413,
                    "IMAGE_PIXEL_LIMIT_EXCEEDED",
                    "解码后的图片像素数量超过允许上限。",
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


def _encode_png(image: Image.Image) -> bytes:
    output = io.BytesIO()
    image.save(output, format="PNG")
    return output.getvalue()


async def create_mirror_png(
    upload: UploadFile, contract_text: str
) -> bytes:
    try:
        contract = parse_contract(contract_text)
        image_bytes = await _read_upload(upload)
        actual_hash = hashlib.sha256(image_bytes).hexdigest()
        if not hmac.compare_digest(actual_hash, contract.image_sha256):
            raise ApiError(
                422,
                "GRID_IMAGE_HASH_MISMATCH",
                "网格合同与当前上传图片不匹配，可能已经过期。",
            )

        source = _decode_normalized_rgba(
            image_bytes, upload.content_type or ""
        )
        validate_grid_contract(contract, source.size)
        return _encode_png(mirror_cells(source, contract))
    finally:
        await upload.close()
