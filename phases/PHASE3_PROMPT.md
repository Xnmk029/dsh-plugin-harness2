# Phase 3 ONLY — Python sidecar `DshSubstrate` (Sonnet 5.5 high)

Model: **claude-sonnet-5-5**, effort **high**. No Opus. Do not break the already-PASS TypeScript package. No git remote/push/gh. No searching GitHub for user accounts. English-only inputs; do not open `*.zh.md` / `*.i18n.yaml` as task inputs.

## Context
- Plugin (PASS): `/workspace/harness2-dsh/packages/dsh-plugin-harness2/` — do not regress format; touch only if sidecar needs a tiny documented config example.
- Eval: `/workspace/harness2-dsh-eval/out/VERDICT.md`, `EVAL.md`, `SEAM_MAP.md` — recommendation **C** hybrid, sidecar-led.
- Reference Harness² (read-only): `/workspace/harness2/harness2/substrate/base.py`, `codex.py`, `opencode.py`, `core/recursion.py` (for interfaces only — implement a **minimal** subset).
- dsh Python SDK docs/source (read-only): `/workspace/deepseek-harness/python/` if present.
- Helper launcher: `/workspace/harness2-dsh/scripts/dsh-src.sh`
- Quarantined earlier self-write (negative example only, do not copy blindly): `/workspace/harness2-dsh/_quarantine-selfwrite/python/`

## Goals
Create `/workspace/harness2-dsh/python/` as an installable package `harness2_dsh`:

1. **`DshSubstrate`** (install mode name `dsh_workspace`):
   - `materialise(tree_dir, work_dir)` → copy skills/scripts/hooks files into work_dir; **generate** a `candidate.patch.yml` that enables `dsh-plugin-harness2` with section *File paths and recorder path under work_dir.
   - `preflight()` → check `dsh --version` (via env `DSH_BIN` or `scripts/dsh-src.sh`).
   - `execute(...)` → launch one isolated process: unique `DSH_HOME`, `cwd=work_dir`, profile `headless` (or sdk), `--patch` the candidate patch. Support **dry-run** (default): print planned command + paths, exit 0 without calling the model.
   - `read_trajectory(work_dir)` → read recorder JSONL / `.txt` if present.

2. **Improver channel `dsh`** (stub acceptable):
   - Interface to run an improver session with `cwd` = context dir; dry-run only unless `HARNESS2_DSH_LIVE=1`.
   - Explicitly **do not** implement `claude_cli`.

3. **Minimal PPC skeleton** (`recursion_stub` or similar):
   - k=1 parallel path: base → propose stub (copy tree) → probe dry-run → compose stub (pick first).
   - Enough to prove wiring; not paper-faithful Ledger/Library.

4. **CLI**
   - `python -m harness2_dsh.dry_run --tree <dir> [--ppc]` exits 0 offline.
   - Document env vars: `DSH_HOME` base, `DSH_BIN`, `HARNESS2_DSH_LIVE`.

5. **Packaging**
   - `pyproject.toml`, README (English), examples under `/workspace/harness2-dsh/examples/` (demo harness tree + sample patch).
   - `scripts/smoke_dry_run.sh` green.
   - Update root `/workspace/harness2-dsh/README.md` and `docs/NO_REMOTE_GIT.md` (Ming inits git **only on his machine**; placeholders `YOUR_GITHUB_USER/your-repo` only).
   - `scripts/pack.sh` produces `/workspace/harness2-dsh-mvp.zip` excluding `node_modules`, `.venv`, `__pycache__`, large logs optional.

6. **Privacy**
   - Never write Ming's emails, private repo URLs, or GitHub usernames into the tree.

## Out of scope
- Full Harness² port / benchmarks JobBench LAB
- Live model runs (unless trivial dry path)
- Creator mode recursion

## Deliverables
- Working python package + dry_run green
- `/workspace/harness2-dsh/phases/PHASE3_REPORT.md`
- `/workspace/harness2-dsh-mvp.zip` via pack.sh

Print short English summary when done.
