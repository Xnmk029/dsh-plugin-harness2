# Harness² × DeepSeek Harness (dsh) — Hybrid MVP

**Shape C** hybrid, sidecar-led: a Python sidecar (`DshSubstrate` + `dsh` improver channel) drives
dsh, and a small out-of-tree Cordis bundle supplies the in-process seams. No dsh core changes.

**Not affiliated with Google LLC or DeepSeek.** Harness² is Apache-2.0; dsh is MIT. This project
is Apache-2.0 (see `LICENSE`); the plugin package under `packages/` is MIT.

## Layout

```
packages/dsh-plugin-harness2/   TS Cordis bundle: sections, recorder, guard (built, 26 tests)
python/harness2_dsh/            DshSubstrate, dsh channel, PPC stub, dry_run CLI (see python/README.md)
examples/                       demo_harness/ tree, candidate.patch.yml sample, adopted-preset sketch
docs/                           ARCHITECTURE.md, NO_REMOTE_GIT.md
scripts/                        dsh-src.sh, smoke_dry_run.sh, pack.sh
phases/                         per-phase prompts and reports
```

## Quick start (offline, no model)

```sh
./scripts/smoke_dry_run.sh                       # unit tests + dry-run + PPC skeleton
cd python
PYTHONPATH=. python3 -m harness2_dsh.dry_run --tree ../examples/demo_harness --ppc
```

The dry-run prints the planned `DSH_HOME`, `candidate.patch.yml`, trajectory path and commands,
and exits 0 even when `dsh` is unavailable. `pip install -e python/` also works
(console script `harness2-dsh-dry-run`).

## Environment variables

| Variable | Meaning |
|---|---|
| `DSH_BIN` | dsh executable. Default `scripts/dsh-src.sh`, else `dsh` on PATH. |
| `DSH_HOME` | **Base** dir for isolated homes; each run gets `<base>/<run_id>/home`. |
| `HARNESS2_DSH_LIVE` | `1` allows model-reaching runs (needs `dry_run=False` too). Default: dry-run. |

## Status

| Piece | Status |
|---|---|
| `dsh-plugin-harness2` (sections, recorder, guard, config schema) | Done, built, tested; booted in a real dsh to the credential check |
| `DshSubstrate`: materialise, preflight, execute (dry-run), read_trajectory | Done; generated patch verified with real `dsh --dump-config` |
| Live `execute` (`headless` subprocess) | Implemented behind two gates; tested only against a fake `dsh` |
| Live `execute` (`sdk` profile) | Written from the SDK README; untested |
| Improver channel `dsh` | Stub: dry-run unless `HARNESS2_DSH_LIVE=1` |
| PPC k=1 skeleton | Wiring only (copy-tree propose, first-pick compose) |
| Ledger, blind selection, Library, reflection | Not ported (stay in upstream Harness²) |
| `claude_cli` channel, Creator-mode recursion | Out of scope, never |
| Publish adopted preset | Docs + `examples/adopted-preset.example.yml` only |

No model call has been made by any code here.

## Using a real dsh

Do not modify the dsh or Harness² checkouts. Build the plugin once, then let the sidecar provision
each isolated home (`dsh plugin --profile headless add packages/dsh-plugin-harness2`):

```sh
(cd packages/dsh-plugin-harness2 && npm install && npm run build)
export DSH_BIN=/path/to/dsh            # optional
export DSH_HOME=/path/to/homes-base    # optional
export HARNESS2_DSH_LIVE=1             # and construct DshSubstrate(dry_run=False)
```

## Local-only git

This tree has no git remote and none is configured from the agent box. Initialise git on your own
machine; see [`docs/NO_REMOTE_GIT.md`](docs/NO_REMOTE_GIT.md). Use only the placeholder
`YOUR_GITHUB_USER/your-repo` until you fill it in locally.

## Pack

```sh
./scripts/pack.sh        # -> /workspace/harness2-dsh-mvp.zip
```

Excludes `node_modules`, `.venv`, `__pycache__`, `*.egg-info`, logs, `out/`, `_quarantine-selfwrite/`.

## Privacy

Never commit emails, private repo URLs or real GitHub usernames. Placeholders only.
