#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

if [ ! -x .venv/bin/python3 ]; then
  python3 -m venv .venv
fi

.venv/bin/python3 -m pip install --upgrade pip
.venv/bin/python3 -m pip install -r requirements.txt

rm -rf build dist
.venv/bin/python3 -m PyInstaller \
  --onefile \
  --name selectra-backend-mac-arm64 \
  --distpath "dist" \
  --workpath "build" \
  --specpath "build" \
  --paths "$(pwd)" \
  run_backend.py

echo "Built: dist/selectra-backend-mac-arm64"
