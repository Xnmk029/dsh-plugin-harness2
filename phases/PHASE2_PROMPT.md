# Phase 2 ONLY — Host plugin seam depth (still Sonnet 5.5 high)

Model: **claude-sonnet-5-5**, effort **high**. No Opus. No Python sidecar (Phase 3). No git remote/push/gh. Do not search GitHub for user accounts. English-only inputs; do not open `*.zh.md` / `*.i18n.yaml` as task inputs.

## Context (already PASS)
- Package: `/workspace/harness2-dsh/packages/dsh-plugin-harness2/`
- Format + live install verified in Phase 1 / 1.5 (`id: harness2` in dump-config). Do **not** break packaging: keep `main`→`lib/index.js`, `dsh.bundle.patch`, `files`, unscoped name, no `workspace:*`.
- Eval map: `/workspace/harness2-dsh-eval/out/SEAM_MAP.md`, `VERDICT.md`
- Local dsh: `/workspace/deepseek-harness` (read APIs; do not modify dsh product sources)
- Isolated DSH_HOME from 1.5 may be reused: `/workspace/harness2-dsh/out/dsh-home-phase15`
- Helper: `/workspace/harness2-dsh/scripts/dsh-src.sh`

## Goals (implement in the plugin package)
Upgrade stubs to **usable probe seams** without claiming full Harness²:

1. **Sections (`src/sections.ts`)**
   - Keep `interpolate: false` for c1–c4.
   - Allow config to supply either literal strings **or** absolute file paths (load UTF-8 text). Document precedence.
   - Stable section `name`s; keep orders documented.
   - Empty string → do not register that section (or register no-op consistently; document).

2. **Recorder (`src/recorder.ts`)**
   - When `path` is non-empty, append JSONL records suitable for Harness²-style trajectories.
   - Prefer observing durable facts: continue `session/event` (do not mutate waterfall results).
   - Include enough fields to reconstruct tool steps: type, time, session id, tool name, call id, and truncated args/result text with a documented max length (e.g. 8–32 KiB) — never silent 8KiB headless JSON trap; this is *our* sink.
   - Optional: emit a companion plain-text trajectory file (`path` + `.txt` or config `textPath`) with `[ACTION]` / `[OBSERVATION]` / `[ERROR]` lines when feasible from events.
   - Failures in the recorder must not crash the agent loop (contain errors).

3. **Guard (`src/guard.ts`)**
   - Keep `denyTools` name deny-list on `tools/pre-execute` (call `next` correctly; deny by returning rejected result per dsh tool pipeline docs — **read** `docs/tool-execution-pipeline.md` and tools package README before coding).
   - Add optional `denyPathGlobs` (or similar) for obvious leak paths if `fs` tool args are visible at pre-execute; if not reliably available, document gap and keep tool-name deny only.
   - Do not disable `tool-web` inside the always-on bundle patch; keep using `cordis.probe.patch.yml` overlay.

4. **Config schema (preferred)**
   - Add schemastery `Config` if peers allow, so `--dump-config-schema` shows fields. If adding `@deepseek-ai/schemastery` as a **dependency** (not peer) matches dsh packages, do it. If it risks format breakage, document deferral.

5. **Tests**
   - Extend `tests/*.test.mjs` for: file-based sections, recorder append (tmpdir), denyTools behavior with fake ctx.
   - `npm run build` and `npm test` must pass (Node 22 PATH as in Phase 1.5).

6. **Re-verify install**
   - Rebuild; with isolated DSH_HOME, re-run `--dump-config` (and ideally `--dump-config-schema`) to confirm still loads. Save artifacts under `/workspace/harness2-dsh/out/phase2.*`.

## Out of scope
- Python `DshSubstrate`, Propose–Probe–Compose orchestration
- Publishing adopted presets via Plugin Manager automation
- Creator mode / plugin_manager inside recursion
- `claude_cli` channel
- Changing `/workspace/deepseek-harness` or `/workspace/harness2` sources

## Deliverables
- Updated plugin sources + green build/tests
- `/workspace/harness2-dsh/phases/PHASE2_REPORT.md` (English): what changed, API of config, test results, dump-config confirmation, remaining gaps for Phase 3

Print a short English summary when done.
