# Architecture — Harness² × dsh hybrid (shape C)

English technical overview. Recommendation **C** from the eval (`VERDICT.md`):
sidecar-led hybrid. No dsh core fork. No Creator-mode recursion. No `claude_cli`
improver channel.

## Components

```
┌─────────────────────────────────────────────────────────────┐
│  Python sidecar (harness2_dsh)                              │
│  · DshSubstrate (install mode dsh_workspace)                │
│  · dsh improver channel (Propose / Compose)                 │
│  · PPC stub k=1 (base → propose → probe → compose, no Ledger)│
│  · materialise → workspace + candidate.patch.yml            │
└───────────────┬─────────────────────────────▲───────────────┘
                │ one process per rollout     │ trajectory /
                │ DSH_HOME + cwd + --patch    │ token summary
                ▼                             │
┌─────────────────────────────────────────────────────────────┐
│  dsh process (profile harness2)                             │
│  bundle dsh-plugin-harness2:                                │
│    sections (interpolate:false) · recorder · guard · hooks  │
└─────────────────────────────────────────────────────────────┘
```

## Install mode `dsh_workspace`

1. `materialise(tree_dir, work_dir)` copies the section files (c1..c4), `.agents/skills`,
   `scripts`, `.codex/hooks.json` into an empty `work_dir`.
2. It generates `<work_dir>/candidate.patch.yml`: a patch that replaces the bundle's
   `harness2` row (by id) with this candidate's absolute `sections.*File` paths, the
   recorder path under `<work_dir>/.harness2/`, and web guards (`tool-web` disabled).
   Hooks (`dsh-hooks-codex`) are wired only with `enable_hooks=True`.
3. `execute(...)` plans one process (dry-run by default):
   - `DSH_HOME=<base>/<run_id>/home` (base = env `DSH_HOME`), unique per run
   - `cwd=work_dir`, profile `headless` (CLI one-shot) or `sdk` (Python SDK)
   - `dsh --profile headless --patch <work_dir>/candidate.patch.yml "<task>"`
   - a fresh home first gets `dsh plugin --profile headless add <packages/dsh-plugin-harness2>`
     (the plugin must be built: `npm run build`).
4. Live execution needs `dry_run=False` **and** `HARNESS2_DSH_LIVE=1`.
5. `read_trajectory(work_dir)` returns the recorder's `.txt` (or renders the JSONL).

Only **data** varies per candidate. Bundle **code** is fixed and reviewed.

## Editable surface (`DSH_SURFACE`)

| Comp | File(s) | Delivery |
|------|---------|----------|
| c1 | `systemprompt.md` | `harness2-sections` |
| c2 | `guardrails.md` | `harness2-sections` |
| c3 | `LongTermMEMORY.md` | `harness2-sections` |
| c4 | `tool_descriptions/tool_guidance.md` | `harness2-sections` |
| c6 | `.agents/skills/<n>/SKILL.md` | `dsh-skill-filesystem` (workspace root) |
| c7 | `scripts/*.py` | `tool-bash` |
| c8 | `.codex/hooks.json` (5 events) | `dsh-hooks-codex` |
| c5 | `sub_agents/` | **phase 2** (`allow_subagents=False`) |

## What is stubbed in this MVP

- Full Harness² Ledger / blind selection / Library / reflection — not ported. The PPC
  skeleton (`recursion_stub`) is k=1: base → propose (copies the tree) → probe (dry-run
  rollout) → compose (picks the first). It proves wiring only; it is not paper-faithful.
- Live launch — subprocess path (`headless`) is exercised only against a fake `dsh` in
  tests; the `sdk` profile path is written against the SDK README and untested live.
  No model call has been made by this sidecar.
- Improver channel `dsh` — stub: dry-run unless `HARNESS2_DSH_LIVE=1`. `claude_cli` is
  deliberately not implemented.
- Publish-adopted-as-preset — docs + `examples/adopted-preset.example.yml`, not
  Plugin Manager automation.
- Recorder / guard — real Cordis hooks; event-field mapping is best-effort across
  dsh versions (sidecar can re-render from `RunResult.events`).

## Depending on upstream (do not modify in place)

| Tree | Role | How this project uses it |
|------|------|--------------------------|
| Harness² | Method reference | Read-only concepts; this package is self-contained |
| deepseek-harness | Runtime + SDK | Optional path install of Python SDK; peerDeps on `@deepseek-ai/*` for the bundle |

See root `README.md` for local path notes.
