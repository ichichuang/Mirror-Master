#!/usr/bin/env sh
set -eu

PROJECT_ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
VENV_DIR="$PROJECT_ROOT/backend/.venv"

if [ ! -x "$VENV_DIR/bin/python" ]; then
  if command -v python3.12 >/dev/null 2>&1 \
    && python3.12 --version >/dev/null 2>&1; then
    python3.12 -m venv "$VENV_DIR"
  elif command -v mise >/dev/null 2>&1; then
    mise exec python@3.12.10 -- python -m venv "$VENV_DIR"
  else
    echo "需要 Python 3.12 或 mise 才能创建 backend/.venv。" >&2
    exit 1
  fi
fi

"$VENV_DIR/bin/python" -m pip install -r "$PROJECT_ROOT/backend/requirements.txt"

cd "$PROJECT_ROOT"
if command -v pnpm >/dev/null 2>&1; then
  pnpm install --frozen-lockfile
  pnpm run build
elif command -v corepack >/dev/null 2>&1; then
  corepack pnpm install --frozen-lockfile
  corepack pnpm run build
else
  echo "需要 pnpm 或 corepack 才能构建前端。" >&2
  exit 1
fi

exec "$VENV_DIR/bin/python" -m uvicorn app.main:app \
  --app-dir "$PROJECT_ROOT/backend" \
  --host 127.0.0.1 \
  --port 8000 \
  --no-access-log
