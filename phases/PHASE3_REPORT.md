# Phase 3 Report: Python sidecar `DshSubstrate`

**Result: PASS for the dry-run scope.** `python -m harness2_dsh.dry_run --tree examples/demo_harness --ppc` exits 0 offline, 13 unit tests pass, `scripts/smoke_dry_run.sh` is green (also from the unzipped archive), and the zip is built. No model call was made anywhere.

Model: claude-sonnet-5-5, effort high. The TypeScript package was not touched. `/workspace/deepseek-harness` and `/workspace/harness2` were read only. The quarantined self-write was not copied; everything in `python/` is new.

## What was built (`python/harness2_dsh/`, about 650 lines)

| Module | Role |
| --- | --- |
| `dsh_cli.py` | Resolve dsh (`DSH_BIN`, else `scripts/dsh-src.sh`, else `dsh`), `dsh --version`, per-run `DSH_HOME` planning, the `HARNESS2_DSH_LIVE` gate, `RunPlan`, subprocess launch |
| `materialise.py` | Install mode `dsh_workspace`: copy the tree into an empty `work_dir`, write `candidate.patch.yml` |
| `substrate.py` | `DshSubstrate`: `materialise`, `preflight`, `execute`, `read_trajectory` (+ `read_records`) |
| `channel.py` | Improver channel `dsh` (stub); `make_channel("claude_cli")` raises on purpose |
| `recursion_stub.py` | PPC k=1: base rollout, propose (copy tree), probe rollout, compose (first pick) |
| `dry_run.py` / `__main__.py` | CLI |

Also: `pyproject.toml` (stdlib only, optional `sdk` extra), `python/README.md`, `python/tests/` (stdlib `unittest`), a regenerated `examples/candidate.patch.yml`, updated root `README.md`, `docs/ARCHITECTURE.md`, `docs/NO_REMOTE_GIT.md`, `scripts/pack.sh`, `scripts/smoke_dry_run.sh`.

## Design decisions

- **Generated patch** replaces the bundle's `harness2` row by id (restating the whole config, as the plugin README requires) with absolute `sections.*File` paths and recorder paths under `work_dir/.harness2/`. It also disables `tool-web` and denies `web_search`/`web_fetch`. `**/.harness2/**` is in `denyPathGlobs` so the agent cannot read its own trajectory. Hooks rows are opt-in (`enable_hooks=True`), because `dsh-hooks-codex` is experimental.
- **Isolation:** env `DSH_HOME` is a base directory. Each run uses `<base>/<run_id>/home`, with `cwd=work_dir` and its own `--patch`. A fresh home is provisioned with `dsh plugin --profile <p> add <plugin dir>` as the first planned command.
- **Two gates for live:** `dry_run=False` and `HARNESS2_DSH_LIVE=1`; otherwise `LiveNotEnabled`. `DshChannel(dry_run=True)` and the dry-run CLI force dry even if the env var is set (a test covers this; I found this gap while writing the CLI).
- **Signatures are simplified** versus upstream `Substrate` (`materialise(tree_dir, work_dir)`, no `SurfaceSpec`/`ctx`, no `RunRequest`/`Launcher`), as the task asked for a minimal subset. `sub_agents/` and `AGENTS.md` are reported in `Install.skipped`.

## Verification

| Check | Result |
| --- | --- |
| `python -m unittest discover -s tests` | 13 tests OK |
| `dry_run --tree examples/demo_harness --ppc` | exit 0; also exit 0 with `DSH_BIN` pointing at a missing binary (preflight prints SKIPPED) |
| `scripts/smoke_dry_run.sh` | green, from the repo and from the unzipped archive; works without network (uses `PYTHONPATH`; `INSTALL=1` tests an editable install) |
| Real dsh `0.2.1-alpha.2`: `--profile headless --patch <generated> --dump-config` against the phase-1.5 home | exit 0; `harness2` row shows the candidate's paths and guards; `tool-web` shows `disabled: true` |
| Same patch, real boot with no `DEEPSEEK_API_KEY`, stdin closed | stops at `MISSING_CREDENTIAL` (before any model request) |
| Live subprocess path | exercised only with a fake `DSH_BIN` script (checks `DSH_HOME`, cwd, `--patch` in argv) |
| Privacy grep of the packed tree | only `git@github.com:YOUR_GITHUB_USER/your-repo.git` placeholders |

## Not verified / known limits

- No model-backed run. The `sdk` profile path (`DeepSeekHarness(..., patches=...)`) follows the SDK README but was never run (the SDK package is not installed here).
- `dsh plugin add` provisioning of a fresh home is planned and wired but was not run in a fresh home this phase (phase 1.5 ran it once); it needs pnpm and a built plugin.
- The `hooks-codex` row is generated but not booted.
- PPC is wiring only: the propose stub changes nothing, and the 4-rollout / 3-session Ledger identity is not reproduced (the stub plans 2 rollouts and 1 improver session).
- `enable_hooks` detection looks at non-empty events among the five bridged ones only.

## Packaging

`scripts/pack.sh` -> `/workspace/harness2-dsh-mvp.zip` (108 KB, 82 files). It uses the `zip` CLI if present, otherwise `python3 -m zipfile` (this box has no `zip`). It excludes `node_modules`, `.venv`, `__pycache__`, `*.egg-info`, `*.log`, `out/` and `_quarantine-selfwrite/`. An older zip from an earlier attempt that was sitting at that path (it contained the quarantined files) was overwritten.
