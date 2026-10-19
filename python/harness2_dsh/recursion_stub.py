"""Minimal Propose–Probe–Compose wiring, k=1 parallel path. NOT paper-faithful.

base rollout -> propose (stub: copy the base tree) -> probe rollout of the candidate -> compose
(stub: pick the first candidate). No Ledger, selection, Library or reflection: those stay in
upstream Harness². The point is to prove that DshSubstrate and the `dsh` channel wire together.
"""

from __future__ import annotations

import shutil
import tempfile
from dataclasses import dataclass, field
from pathlib import Path

from .channel import DshChannel
from .dsh_cli import RunPlan
from .materialise import Install
from .substrate import DshSubstrate


@dataclass
class PPCResult:
    k: int
    base_plan: RunPlan
    propose_plan: RunPlan
    probe_plan: RunPlan
    chosen: str
    chosen_tree: Path
    rollouts: int  # dsh processes planned/launched for rollouts
    sessions: int  # improver sessions planned/launched
    live: bool
    installs: dict[str, Install] = field(default_factory=dict)

    def summary(self) -> str:
        return (
            f"PPC stub k={self.k}: rollouts={self.rollouts} improver_sessions={self.sessions} "
            f"chosen={self.chosen} tree={self.chosen_tree} live={self.live}"
        )


def _copy_tree(src: Path, dst: Path) -> Path:
    shutil.copytree(src, dst, ignore=shutil.ignore_patterns("__pycache__", "*.pyc", ".git"))
    return dst


def run_ppc_stub(
    base_tree: Path,
    substrate: DshSubstrate,
    channel: DshChannel,
    *,
    runs_root: Path | None = None,
    task: str = "Complete the task in the working directory.",
) -> PPCResult:
    runs = Path(runs_root) if runs_root else Path(tempfile.mkdtemp(prefix="h2dsh-ppc-"))
    runs.mkdir(parents=True, exist_ok=True)

    # 1. base rollout
    base = substrate.materialise(base_tree, runs / "work" / "base")
    base_plan = substrate.execute(base, task, run_id="base")

    # 2. propose: the improver session sees the base tree + its trajectory in its context dir.
    ctx = runs / "context"
    ctx.mkdir(exist_ok=True)
    _copy_tree(Path(base_tree), ctx / "harness")
    (ctx / "base_trajectory.txt").write_text(substrate.read_trajectory(base.work_dir), encoding="utf-8")
    improver = channel.run(
        "Propose one edit to the harness under ./harness using ./base_trajectory.txt as evidence.",
        ctx,
        run_id="propose-1",
    )
    cand_tree = _copy_tree(Path(base_tree), runs / "candidates" / "cand1")  # stub: unchanged copy

    # 3. probe: roll the candidate in its own work_dir/process.
    cand = substrate.materialise(cand_tree, runs / "work" / "cand1")
    probe_plan = substrate.execute(cand, task, run_id="probe-cand1")

    # 4. compose (stub): pick the first candidate.
    return PPCResult(
        k=1,
        base_plan=base_plan,
        propose_plan=improver.plan,
        probe_plan=probe_plan,
        chosen="cand1",
        chosen_tree=cand_tree,
        rollouts=2,
        sessions=1,
        live=(not substrate.dry_run) or improver.live,
        installs={"base": base, "cand1": cand},
    )
