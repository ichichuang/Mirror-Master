from __future__ import annotations

import hashlib
import hmac
import json
import secrets
from typing import Iterable

from app.chart_detection.types import QuadTuple


_CANDIDATE_AUTHORITY_KEY = secrets.token_bytes(32)


def sign_candidate_id(
    detector: str,
    *,
    image_sha256: str,
    natural_width: int,
    natural_height: int,
    source_quad: QuadTuple,
    rectified_width: int,
    rectified_height: int,
    pitch_x: float,
    pitch_y: float,
    columns: int,
    rows: int,
    x_boundaries: Iterable[int],
    y_boundaries: Iterable[int],
    matrix_digest: str,
) -> str:
    signature = _candidate_signature(
        image_sha256=image_sha256,
        natural_width=natural_width,
        natural_height=natural_height,
        source_quad=source_quad,
        rectified_width=rectified_width,
        rectified_height=rectified_height,
        pitch_x=pitch_x,
        pitch_y=pitch_y,
        columns=columns,
        rows=rows,
        x_boundaries=x_boundaries,
        y_boundaries=y_boundaries,
        matrix_digest=matrix_digest,
    )
    return f"{detector}-{signature[:32]}"


def verify_candidate_id(
    candidate_id: str,
    *,
    image_sha256: str,
    natural_width: int,
    natural_height: int,
    source_quad: QuadTuple,
    rectified_width: int,
    rectified_height: int,
    pitch_x: float,
    pitch_y: float,
    columns: int,
    rows: int,
    x_boundaries: Iterable[int],
    y_boundaries: Iterable[int],
    matrix_digest: str,
) -> bool:
    _separator, _dash, supplied_signature = candidate_id.rpartition("-")
    if not supplied_signature:
        return False
    expected = _candidate_signature(
        image_sha256=image_sha256,
        natural_width=natural_width,
        natural_height=natural_height,
        source_quad=source_quad,
        rectified_width=rectified_width,
        rectified_height=rectified_height,
        pitch_x=pitch_x,
        pitch_y=pitch_y,
        columns=columns,
        rows=rows,
        x_boundaries=x_boundaries,
        y_boundaries=y_boundaries,
        matrix_digest=matrix_digest,
    )[:32]
    return hmac.compare_digest(supplied_signature, expected)


def _candidate_signature(
    *,
    image_sha256: str,
    natural_width: int,
    natural_height: int,
    source_quad: QuadTuple,
    rectified_width: int,
    rectified_height: int,
    pitch_x: float,
    pitch_y: float,
    columns: int,
    rows: int,
    x_boundaries: Iterable[int],
    y_boundaries: Iterable[int],
    matrix_digest: str,
) -> str:
    payload = {
        "imageSha256": image_sha256,
        "naturalWidth": natural_width,
        "naturalHeight": natural_height,
        "sourceQuad": [
            [round(float(x), 6), round(float(y), 6)]
            for x, y in source_quad
        ],
        "rectifiedWidth": rectified_width,
        "rectifiedHeight": rectified_height,
        "pitchX": round(float(pitch_x), 8),
        "pitchY": round(float(pitch_y), 8),
        "columns": columns,
        "rows": rows,
        "xBoundaries": list(x_boundaries),
        "yBoundaries": list(y_boundaries),
        "matrixDigest": matrix_digest,
    }
    encoded = json.dumps(
        payload,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=True,
    ).encode("ascii")
    return hmac.new(
        _CANDIDATE_AUTHORITY_KEY,
        encoded,
        hashlib.sha256,
    ).hexdigest()
