#!/bin/sh
# Run the local dsh source CLI (deepseek-harness) from the caller's cwd.
# Mirrors the root `pnpm dsh` script (node --import tsx/esm apps/cli/src/bin.ts) without chdir.
DSH_REPO="${DSH_REPO:-/workspace/deepseek-harness}"
export PATH="/tmp/pnpm11-shim:/tmp/node22/node_modules/node/bin:$PATH"
export TSX_TSCONFIG_PATH="${TSX_TSCONFIG_PATH:-$DSH_REPO/tsconfig.json}"
exec node --import "$DSH_REPO/node_modules/tsx/dist/esm/index.mjs" "$DSH_REPO/apps/cli/src/bin.ts" "$@"
