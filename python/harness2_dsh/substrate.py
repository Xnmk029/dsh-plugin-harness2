"""DshSubstrate: dsh behind a minimal Harness²-style substrate (install mode `dsh_workspace`).

A subset of `harness2.substrate.base.Substrate`: `materialise`, `preflight`, `execute`,
`read_trajectory`. Signatures are simplified (no SurfaceSpec/ctx) because this sidecar does not
port Harness² core. Each rollout is its own process: unique DSH_HOME, cwd=work_dir, its own --patch.
"""

from __future__ import annotations

import json
from pathlib import Path

from . import dsh_cli
from .dsh_cli import LiveNotEnabled, RunPlan
from .materialise import INSTALL_MODE, Install, materialise_dsh_workspace

DEFAULT_TASK = "Follow your system prompt and complete the task in the working directory."


def render_records(records: list[dict], max_chars: int = 2000) -> str:
    """Fallback renderer from recorder JSONL to the [ACTION]/[OBSERVATION]/[ERROR] grammar."""
    out: list[str] = []
    for r in records:
        t = r.get("type")
        if t == "tool/call":
            out.append(f"[ACTION] {r.get('tool', '?')}({r.get('arguments', '')[:max_chars]})")
        elif t == "tool/result":
            tag = "[ERROR]" if r.get("isError") else "[OBSERVATION]"
            out.append(f"{tag} {str(r.get('text', ''))[:max_chars]}")
        elif t == "turn/end" and (r.get("reason") or {}).get("kind") == "error":
            out.append(f"[ERROR] turn ended: {(r['reason'] or {}).get('message', '')}")
    return "\n".join(out)


class DshSubstrate:
    name = "dsh"
    install_mode = INSTALL_MODE

    def __init__(
        self,
        *,
        profile: str = "headless",
        dry_run: bool = True,
        home_base: Path | None = None,
        enable_hooks: bool = False,
    ) -> None:
        if profile not in ("headless", "sdk"):
            raise ValueError("profile must be 'headless' (CLI one-shot) or 'sdk' (Python SDK)")
        self.profile = profile
        self.dry_run = dry_run
        self.home_base = Path(home_base) if home_base else None
        self.enable_hooks = enable_hooks

    # -- Substrate surface -------------------------------------------------------------------
    def materialise(self, tree_dir: Path, work_dir: Path) -> Install:
        return materialise_dsh_workspace(tree_dir, work_dir, enable_hooks=self.enable_hooks)

    def preflight(self) -> str:
        """`dsh --version` through DSH_BIN / scripts/dsh-src.sh. Never starts a model session."""
        return dsh_cli.dsh_version()

    def plan(self, install: Install, task: str = DEFAULT_TASK, run_id: str | None = None) -> RunPlan:
        return dsh_cli.build_plan(
            run_id=run_id or dsh_cli.new_run_id(),
            profile=self.profile,
            task=task,
            cwd=install.work_dir,
            patch_path=install.patch_path,
            base=self.home_base,
            trajectory_path=install.recorder_path,
            dry_run=self.dry_run,
        )

    def execute(
        self,
        install: Install,
        task: str = DEFAULT_TASK,
        *,
        run_id: str | None = None,
        timeout: float | None = 1800,
    ) -> RunPlan:
        """Run (or, by default, only plan) one rollout and return its RunPlan.

        Dry-run prints nothing itself and calls nothing: callers print `plan.describe()`.
        Live needs `dry_run=False` AND HARNESS2_DSH_LIVE=1 (a model call costs money).
        """
        plan = self.plan(install, task, run_id)
        if self.dry_run:
            return plan
        if not dsh_cli.live_enabled():
            raise LiveNotEnabled(
                f"dry_run=False requires {dsh_cli.ENV_LIVE}=1; refusing to reach a model without it"
            )
        if self.profile == "sdk":
            self._execute_sdk(plan, task, timeout)
        else:
            proc = dsh_cli.run_plan(plan, timeout=timeout)
            (install.work_dir / ".harness2").mkdir(exist_ok=True)
            (install.work_dir / ".harness2" / "stdout.txt").write_text(proc.stdout, encoding="utf-8")
            (install.work_dir / ".harness2" / "stderr.txt").write_text(proc.stderr, encoding="utf-8")
            if proc.returncode != 0:
                raise RuntimeError(f"dsh exited {proc.returncode}: {proc.stderr.strip()[-500:]}")
        return plan

    def _execute_sdk(self, plan: RunPlan, task: str, timeout: float | None) -> None:
        """Python SDK path (profile `sdk`). Written against the SDK README; not exercised live here."""
        try:
            from deepseek_harness import DeepSeekHarness  # type: ignore[import-not-found]
        except ImportError as exc:
            raise RuntimeError("profile='sdk' needs `pip install deepseek-harness-sdk`") from exc
        plan.dsh_home.mkdir(parents=True, exist_ok=True)
        with DeepSeekHarness(
            dsh_home=str(plan.dsh_home),
            cwd=str(plan.cwd),
            profile="sdk",
            patches=(str(plan.patch_path),),
            request_timeout_seconds=timeout,
        ) as harness:
            harness.run(task, session_id=plan.run_id)

    def read_trajectory(self, work_dir: Path, *, max_chars: int = 200_000) -> str:
        """Recorder output for a work_dir: the .txt trajectory if present, else rendered JSONL, else ''."""
        rec = Path(work_dir) / ".harness2"
        txt, jsonl = rec / "trajectory.jsonl.txt", rec / "trajectory.jsonl"
        if txt.is_file():
            return txt.read_text(encoding="utf-8", errors="replace")[:max_chars]
        if jsonl.is_file():
            return render_records(self.read_records(work_dir))[:max_chars]
        return ""

    def read_records(self, work_dir: Path) -> list[dict]:
        jsonl = Path(work_dir) / ".harness2" / "trajectory.jsonl"
        if not jsonl.is_file():
            return []
        records = []
        for line in jsonl.read_text(encoding="utf-8", errors="replace").splitlines():
            try:
                records.append(json.loads(line))
            except ValueError:
                continue  # a torn last line from a killed process
        return records
