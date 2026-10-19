#!/usr/bin/env bash
# Offline smoke test: unit tests + dry-run CLI (single rollout and the PPC k=1 skeleton).
# Uses PYTHONPATH, so no install or network is needed. INSTALL=1 additionally checks an
# editable install in python/.venv (needs setuptools reachable by pip).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PY="$ROOT/python"
cd "$PY"
if [[ "${INSTALL:-0}" == "1" ]]; then
  [[ -d .venv ]] || python3 -m venv .venv
  # shellcheck disable=SC1091
  source .venv/bin/activate
  pip install -q -e .
else
  export PYTHONPATH="$PY${PYTHONPATH:+:$PYTHONPATH}"
fi
# Never let a stray environment turn the smoke test live.
unset HARNESS2_DSH_LIVE
python3 -m unittest discover -s tests
python3 -m harness2_dsh.dry_run --tree "$ROOT/examples/demo_harness" --ppc
echo "smoke_dry_run: OK"
