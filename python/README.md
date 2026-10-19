# harness2-dsh (Python sidecar)

Drives DeepSeek Harness (`dsh`) as a Harness² substrate. One rollout = one `dsh` process with its
own `DSH_HOME`, `cwd` and generated `--patch`. Dry-run is the default and never reaches a model.
Minimal subset of the Harness² interfaces, not a port. Python >= 3.10, no runtime dependencies.

## Run offline

```sh
cd python
PYTHONPATH=. python3 -m harness2_dsh.dry_run --tree ../examples/demo_harness --ppc   # exit 0
PYTHONPATH=. python3 -m unittest discover -s tests
# or install:  pip install -e .   (console script: harness2-dsh-dry-run)
```

`dry_run` prints the planned `DSH_HOME`, `cwd`, generated `candidate.patch.yml`, trajectory path
and commands. A missing `dsh` only turns the `preflight` line into `SKIPPED`; exit stays 0.
Options: `--tree`, `--ppc`, `--work-dir` (keep output), `--profile headless|sdk`, `--task`.

## Environment

| Variable | Meaning |
|---|---|
| `DSH_BIN` | dsh executable (may be several words). Default: `scripts/dsh-src.sh` of this checkout, else `dsh` on PATH. |
| `DSH_HOME` | **Base** directory for isolated homes. Each run's child gets `<base>/<run_id>/home`; the base itself is never used as a dsh home. Default `<tmp>/harness2-dsh-homes`. |
| `HARNESS2_DSH_LIVE` | `1` allows model-reaching runs. Anything else keeps everything dry. |

## API

```python
from pathlib import Path
from harness2_dsh import DshSubstrate, DshChannel, run_ppc_stub

sub = DshSubstrate(profile="headless", dry_run=True)       # install mode dsh_workspace
sub.preflight()                                            # dsh --version, no model
inst = sub.materialise(Path("examples/demo_harness"), Path("/tmp/w1"))   # copies files, writes candidate.patch.yml
plan = sub.execute(inst, "do the task")                    # dry-run: returns RunPlan, spawns nothing
print(plan.describe())
sub.read_trajectory(inst.work_dir)                         # recorder .txt / JSONL, "" if none

DshChannel().run("improve the harness", context_dir=Path("/tmp/ctx"))   # cwd = context dir; dry unless live
run_ppc_stub(Path("examples/demo_harness"), sub, DshChannel(dry_run=True))
```

- `materialise(tree_dir, work_dir)`: `work_dir` must be empty or absent. Copies `systemprompt.md`,
  `guardrails.md`, `LongTermMEMORY.md`, `tool_descriptions/`, `.agents/`, `scripts/`, `.codex/`.
  `sub_agents/` and `AGENTS.md` are reported in `Install.skipped` (unsupported).
- Live needs `DshSubstrate(dry_run=False)` **and** `HARNESS2_DSH_LIVE=1`, else `LiveNotEnabled`.
  The `headless` path writes `.harness2/stdout.txt` / `stderr.txt`; the `sdk` path needs
  `pip install deepseek-harness-sdk` and is untested live.
- A fresh home first runs `dsh plugin --profile <p> add <packages/dsh-plugin-harness2>`; build
  the plugin first (`npm install && npm run build` in `packages/dsh-plugin-harness2`).
- Channels: only `dsh`. `make_channel("claude_cli")` raises on purpose.
- The recorder and section files live under `work_dir`; `**/.harness2/**` is in the guard's
  `denyPathGlobs` so the agent cannot read the trajectory.

## Verified vs not

Verified here: unit tests, dry-run CLI, and the generated patch composing under the real dsh
(`--dump-config` shows the `harness2` row with the candidate's paths and `tool-web` disabled), and a
credential-less boot reaching `MISSING_CREDENTIAL` with the plugin loaded. Not verified: any
model-backed run, the `sdk` profile, hooks wiring (`enable_hooks`).
