# Phase 1.5 ONLY — Live dsh install + dump-config verification

Model: **claude-sonnet-5-5**, effort **high**. No Opus. No Phase 2 feature work unless a **minimal format fix** is required for Loader acceptance.

## Goal
Prove `dsh-plugin-harness2` loads in a **real dsh process**:
1. Install into an isolated profile (dedicated `DSH_HOME`, never the user's default home if avoidable).
2. `dsh --profile <p> --dump-config` (or equivalent) shows row **`id: harness2`**.
3. Optionally smoke that `apply` ran (section names present or no boot crash).

Package path: `/workspace/harness2-dsh/packages/dsh-plugin-harness2/`
Local dsh source (read/build only; do not modify product code): `/workspace/deepseek-harness/`

## Constraints
- Launch via environment already using claude-safe from parent. Do not search GitHub for user accounts. No git remote/push/gh.
- English-only docs you create. Do not open `*.zh.md` / `*.i18n.yaml` as task inputs.
- Prefer isolated `DSH_HOME=/workspace/harness2-dsh/out/dsh-home-phase15` (create fresh).
- Node: build previously needed Node >=22.19; reuse `/tmp/node22` if present or install Node 22 under `/tmp` again. Do not break system Node permanently.
- pnpm may be broken via corepack; use whatever works (`npm` / local pnpm from deepseek-harness) and document it.

## Steps
1. Ensure package is built (`npm run build` in the plugin dir).
2. Make `dsh` runnable from `/workspace/deepseek-harness` (pnpm install/build if needed — this can take time; only what's required to run `dsh` CLI). Prefer existing build artifacts if already present.
3. Install: `dsh plugin --profile headless add .` (or `sdk` / a dedicated profile) with `DSH_HOME` set to the isolated dir, from the plugin directory. Use `--ignore-workspace-root-check` if required by dsh when adding a path.
4. Dump config and save output to `/workspace/harness2-dsh/out/phase15.dump-config.txt`. Assert `harness2` row appears.
5. If Loader rejects the package, fix **only** packaging/API mismatches (package.json name resolution, exports, patch shape, inject keys, Config). Re-build and re-test. Do not expand Harness² logic.
6. Write `/workspace/harness2-dsh/phases/PHASE1_5_REPORT.md` with PASS/FAIL, exact commands, stderr snippets, and any format fixes applied (file list + why).

## Success criteria
- PHASE1_5_REPORT.md exists
- dump-config artifact contains harness2
- exit of the verification path is documented; overall Phase 1.5 PASS or FAIL clearly stated

Print a short English summary when done. Do not start Phase 2.
