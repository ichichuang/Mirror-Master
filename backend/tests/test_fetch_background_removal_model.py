from __future__ import annotations

import hashlib
import json
import subprocess
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[2]
FETCH_SCRIPT = (
    PROJECT_ROOT / "scripts" / "fetch-background-removal-model.py"
)


def write_manifest(
    directory: Path,
    source: Path,
    *,
    sha256: str,
) -> Path:
    model_bytes = source.read_bytes()
    manifest = {
        "manifestVersion": "1.0",
        "model": {
            "id": "test-model",
            "version": "test-version",
            "source": source.as_uri(),
            "license": "MIT",
            "expectedFilename": "test-model.onnx",
            "sizeBytes": len(model_bytes),
            "sha256": sha256,
        },
    }
    manifest_path = directory / "manifest.json"
    manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
    return manifest_path


def test_fetch_script_verifies_and_atomically_installs_model(
    tmp_path: Path,
) -> None:
    source = tmp_path / "source.onnx"
    source.write_bytes(b"verified model artifact")
    manifest = write_manifest(
        tmp_path,
        source,
        sha256=hashlib.sha256(source.read_bytes()).hexdigest(),
    )

    result = subprocess.run(
        [
            str(PROJECT_ROOT / "backend" / ".venv" / "bin" / "python"),
            str(FETCH_SCRIPT),
            "--manifest",
            str(manifest),
        ],
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr
    assert (tmp_path / "test-model.onnx").read_bytes() == source.read_bytes()
    assert not (tmp_path / "test-model.onnx.part").exists()


def test_fetch_script_removes_partial_file_after_checksum_failure(
    tmp_path: Path,
) -> None:
    source = tmp_path / "source.onnx"
    source.write_bytes(b"tampered model artifact")
    manifest = write_manifest(
        tmp_path,
        source,
        sha256="0" * 64,
    )

    result = subprocess.run(
        [
            str(PROJECT_ROOT / "backend" / ".venv" / "bin" / "python"),
            str(FETCH_SCRIPT),
            "--manifest",
            str(manifest),
        ],
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode != 0
    assert not (tmp_path / "test-model.onnx").exists()
    assert not (tmp_path / "test-model.onnx.part").exists()
    assert "SHA-256" in result.stderr
