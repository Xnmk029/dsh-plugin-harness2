"""Locate and launch the dsh CLI: one isolated process per rollout.

Environment variables:
  DSH_BIN             dsh executable (may be several words, e.g. "node x.mjs"); default is
                      scripts/dsh-src.sh of this checkout when present, else `dsh` on PATH.
  DSH_HOME            BASE directory for isolated homes. Each run gets <base>/<run_id>/home as
                      its own DSH_HOME in the child. Default: <tmp>/harness2-dsh-homes.
  HARNESS2_DSH_LIVE   must be "1" for any call that can reach a model. Anything else is dry-run.
"""

from __future__ import annotations

import os
import shlex
import subprocess
import tempfile
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Mapping, Sequence

ENV_BIN = "DSH_BIN"
ENV_HOME = "DSH_HOME"
ENV_LIVE = "HARNESS2_DSH_LIVE"


class LiveNotEnabled(RuntimeError):
    """A live (model-reaching) call was requested without HARNESS2_DSH_LIVE=1."""


def live_enabled(env: Mapping[str, str] | None = None) -> bool:
    return (os.environ if env is None else env).get(ENV_LIVE) == "1"


def repo_root() -> Path | None:
    """Checkout root (holds scripts/dsh-src.sh and packages/), or None for a plain install."""
    root = Path(__file__).resolve().parents[2]
    return root if (root / "scripts" / "dsh-src.sh").is_file() else None


def plugin_dir() -> Path | None:
    root = repo_root()
    path = root / "packages" / "dsh-plugin-harness2" if root else None
    return path if path and path.is_dir() else None


def resolve_dsh_bin(env: Mapping[str, str] | None = None) -> list[str]:
    env = os.environ if env is None else env
    if env.get(ENV_BIN):
        return shlex.split(env[ENV_BIN])
    root = repo_root()
    if root:
        return ["sh", str(root / "scripts" / "dsh-src.sh")]
    return ["dsh"]


def dsh_version(env: Mapping[str, str] | None = None, timeout: float = 60.0) -> str:
    """Run `dsh --version`. Never reaches a model. Raises RuntimeError with a remediation hint."""
    cmd = [*resolve_dsh_bin(env), "--version"]
    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout, check=False)
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise RuntimeError(
            f"cannot run {shlex.join(cmd)}: {exc}. Set {ENV_BIN} to a working dsh "
            f"(for example the output of `command -v dsh`) or build the dsh source checkout."
        ) from exc
    out = proc.stdout.strip()
    if proc.returncode != 0 or not out:
        raise RuntimeError(
            f"`{shlex.join(cmd)}` exited {proc.returncode}: {proc.stderr.strip()[:300]}. "
            f"Set {ENV_BIN} to a working dsh."
        )
    return out.splitlines()[-1]


def new_run_id(prefix: str = "run") -> str:
    return f"{prefix}-{datetime.now(timezone.utc):%Y%m%dT%H%M%SZ}-{uuid.uuid4().hex[:8]}"


def home_base(env: Mapping[str, str] | None = None) -> Path:
    env = os.environ if env is None else env
    base = env.get(ENV_HOME)
    return Path(base).expanduser().resolve() if base else Path(tempfile.gettempdir()) / "harness2-dsh-homes"


@dataclass(frozen=True)
class RunPlan:
    """Everything one rollout will do. Printable without side effects (the dry-run output)."""

    run_id: str
    profile: str
    dsh_home: Path
    cwd: Path
    patch_path: Path
    commands: tuple[tuple[str, ...], ...]  # provisioning commands, then the run command last
    env: Mapping[str, str]  # only the variables we set for the child
    trajectory_path: Path | None = None
    dry_run: bool = True

    def describe(self) -> str:
        lines = [
            f"run_id      : {self.run_id}",
            f"mode        : {'dry-run (no model call)' if self.dry_run else 'LIVE'}",
            f"profile     : {self.profile}",
            f"DSH_HOME    : {self.dsh_home}",
            f"cwd         : {self.cwd}",
            f"--patch     : {self.patch_path}",
        ]
        if self.trajectory_path:
            lines.append(f"trajectory  : {self.trajectory_path}")
        for i, cmd in enumerate(self.commands):
            label = "run command " if i == len(self.commands) - 1 else f"setup command {i + 1}"
            lines.append(f"{label}: {shlex.join(cmd)}")
        return "\n".join(lines)


def build_plan(
    *,
    run_id: str,
    profile: str,
    task: str,
    cwd: Path,
    patch_path: Path,
    base: Path | None = None,
    trajectory_path: Path | None = None,
    dry_run: bool = True,
    install_plugin: bool = True,
    env: Mapping[str, str] | None = None,
) -> RunPlan:
    """Plan one isolated dsh process. Pure: touches nothing on disk."""
    dsh = resolve_dsh_bin(env)
    home = (base or home_base(env)) / run_id / "home"
    cmds: list[tuple[str, ...]] = []
    plugin = plugin_dir()
    if install_plugin and plugin:
        # A fresh DSH_HOME has no profile yet; `plugin add` creates it from the shipped template
        # and records the bundle. Needs the plugin built (npm run build) and pnpm on PATH.
        cmds.append((*dsh, "plugin", "--profile", profile, "add", str(plugin)))
    cmds.append((*dsh, "--profile", profile, "--patch", str(patch_path), task))
    return RunPlan(
        run_id=run_id,
        profile=profile,
        dsh_home=home,
        cwd=Path(cwd),
        patch_path=Path(patch_path),
        commands=tuple(cmds),
        env={ENV_HOME: str(home)},
        trajectory_path=trajectory_path,
        dry_run=dry_run,
    )


def run_plan(plan: RunPlan, *, timeout: float | None = None) -> subprocess.CompletedProcess[str]:
    """Execute a plan as real subprocesses. The caller must already have checked the live gate."""
    if not live_enabled():
        raise LiveNotEnabled(f"refusing to launch dsh: set {ENV_LIVE}=1 to allow model-reaching runs")
    plan.dsh_home.mkdir(parents=True, exist_ok=True)
    child_env = {**os.environ, **plan.env}
    last: subprocess.CompletedProcess[str] | None = None
    final = len(plan.commands) - 1
    for i, cmd in enumerate(plan.commands):
        # Setup commands run in the home dir so `plugin add <abs path>` never depends on the workspace.
        cwd = plan.cwd if i == final else plan.dsh_home
        last = subprocess.run(
            list(cmd), cwd=cwd, env=child_env, capture_output=True, text=True, timeout=timeout, check=False
        )
        if last.returncode != 0 and i != final:
            raise RuntimeError(f"setup command failed ({last.returncode}): {shlex.join(cmd)}\n{last.stderr[-500:]}")
    assert last is not None
    return last


def render_command(cmd: Sequence[str]) -> str:
    return shlex.join(cmd)
