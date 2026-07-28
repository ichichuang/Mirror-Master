#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
import urllib.request
from pathlib import Path
from typing import Any


PROJECT_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_MANIFEST = (
    PROJECT_ROOT
    / "backend"
    / "models"
    / "background-removal-model.json"
)
DOWNLOAD_CHUNK_BYTES = 1024 * 1024


def parse_arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "下载并校验项目固定的一键去背景 ONNX 模型。"
        )
    )
    parser.add_argument(
        "--manifest",
        type=Path,
        default=DEFAULT_MANIFEST,
        help="模型 manifest 路径。",
    )
    return parser.parse_args()


def load_model_contract(manifest_path: Path) -> dict[str, Any]:
    payload = json.loads(manifest_path.read_text(encoding="utf-8"))
    if payload.get("manifestVersion") != "1.0":
        raise ValueError("不支持的模型 manifest 版本。")
    model = payload.get("model")
    if not isinstance(model, dict):
        raise ValueError("模型 manifest 缺少 model 合同。")
    expected_filename = model.get("expectedFilename")
    if (
        not isinstance(expected_filename, str)
        or Path(expected_filename).name != expected_filename
    ):
        raise ValueError("模型文件名无效。")
    if not isinstance(model.get("source"), str):
        raise ValueError("模型下载来源无效。")
    if not isinstance(model.get("sizeBytes"), int):
        raise ValueError("模型大小合同无效。")
    sha256 = model.get("sha256")
    if (
        not isinstance(sha256, str)
        or len(sha256) != 64
        or any(character not in "0123456789abcdef" for character in sha256)
    ):
        raise ValueError("模型 SHA-256 合同无效。")
    return model


def fetch_model(manifest_path: Path) -> Path:
    model = load_model_contract(manifest_path)
    target = manifest_path.parent / model["expectedFilename"]
    partial = target.with_suffix(f"{target.suffix}.part")
    partial.unlink(missing_ok=True)
    digest = hashlib.sha256()
    downloaded_size = 0
    try:
        with urllib.request.urlopen(model["source"]) as response:
            with partial.open("wb") as output:
                while chunk := response.read(DOWNLOAD_CHUNK_BYTES):
                    output.write(chunk)
                    digest.update(chunk)
                    downloaded_size += len(chunk)
        if downloaded_size != model["sizeBytes"]:
            raise ValueError(
                "模型大小校验失败："
                f"预期 {model['sizeBytes']} bytes，"
                f"实际 {downloaded_size} bytes。"
            )
        actual_sha256 = digest.hexdigest()
        if actual_sha256 != model["sha256"]:
            raise ValueError(
                "模型 SHA-256 校验失败：下载内容与 manifest 不一致。"
            )
        os.replace(partial, target)
    except Exception:
        partial.unlink(missing_ok=True)
        raise
    return target


def main() -> int:
    arguments = parse_arguments()
    try:
        target = fetch_model(arguments.manifest.resolve())
    except Exception as error:
        print(f"模型下载失败：{error}", file=sys.stderr)
        return 1
    print(f"模型已校验并安装：{target}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
