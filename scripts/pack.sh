#!/usr/bin/env bash
# Pack harness2-dsh into /workspace/harness2-dsh-mvp.zip (or the path given as $1).
# Excludes node_modules, .venv, caches, logs, out/ and _quarantine-selfwrite/.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${1:-}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

STAGE="$TMP/harness2-dsh"
mkdir -p "$STAGE"

tar -C "$ROOT" \
  --exclude=node_modules \
  --exclude=.venv \
  --exclude='__pycache__' \
  --exclude='*.pyc' \
  --exclude=.git \
  --exclude=.mypy_cache \
  --exclude=.pytest_cache \
  --exclude='*.egg-info' \
  --exclude=dist \
  --exclude=build \
  --exclude=.harness2 \
  --exclude=./out \
  --exclude=./_quarantine-selfwrite \
  --exclude='*.log' \
  -cf - . | tar -C "$STAGE" -xf -

if [[ -z "$OUT" ]]; then
  OUT=/workspace/harness2-dsh-mvp.zip
fi

rm -f "$OUT"
case "$OUT" in
  *.zip)
    if command -v zip >/dev/null 2>&1; then
      (cd "$TMP" && zip -qr "$OUT" harness2-dsh)
    else
      # No zip CLI: stdlib zipfile writes the same archive.
      (cd "$TMP" && python3 -m zipfile -c "$OUT" harness2-dsh)
    fi
    ;;
  *.tar.gz|*.tgz)
    tar -C "$TMP" -czf "$OUT" harness2-dsh
    ;;
  *)
    echo "unknown extension for $OUT; using tar.gz" >&2
    OUT="${OUT}.tar.gz"
    tar -C "$TMP" -czf "$OUT" harness2-dsh
    ;;
esac
echo "Wrote $OUT ($(du -h "$OUT" | awk '{print $1}'))"
