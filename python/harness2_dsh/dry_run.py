"""`python -m harness2_dsh.dry_run --tree <dir> [--ppc]`: offline wiring check, exits 0.

Prints the planned DSH_HOME, candidate patch, trajectory paths and commands. Never calls a model:
it always constructs the substrate with dry_run=True, whatever HARNESS2_DSH_LIVE says.
"""

from __future__ import annotations

import argparse
import shutil
import sys
import tempfile
from pathlib import Path

from . import dsh_cli
from .channel import DshChannel
from .recursion_stub import run_ppc_stub
from .substrate import DshSubstrate


def _default_tree() -> Path | None:
    root = dsh_cli.repo_root()
    cand = root / "examples" / "demo_harness" if root else None
    return cand if cand and cand.is_dir() else None


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="python -m harness2_dsh.dry_run", description=__doc__)
    ap.add_argument("--tree", type=Path, default=None, help="harness tree to materialise (default: examples/demo_harness)")
    ap.add_argument("--ppc", action="store_true", help="also run the PPC k=1 skeleton")
    ap.add_argument("--work-dir", type=Path, default=None, help="keep output here (default: temp dir, removed)")
    ap.add_argument("--profile", default="headless", choices=["headless", "sdk"])
    ap.add_argument("--task", default="Say hello and list the workspace.")
    args = ap.parse_args(argv)

    tree = args.tree or _default_tree()
    if tree is None or not Path(tree).is_dir():
        print("error: --tree <dir> is required (no examples/demo_harness found)", file=sys.stderr)
        return 2

    root = args.work_dir or Path(tempfile.mkdtemp(prefix="h2dsh-dry-"))
    cleanup = args.work_dir is None
    try:
        print("== harness2_dsh dry-run (no model call)")
        print(f"HARNESS2_DSH_LIVE={'1 (ignored here: dry_run is forced)' if dsh_cli.live_enabled() else 'unset'}")
        print(f"DSH_HOME base : {dsh_cli.home_base()}")
        print(f"dsh command   : {' '.join(dsh_cli.resolve_dsh_bin())}")

        sub = DshSubstrate(profile=args.profile, dry_run=True, home_base=root / "homes")
        try:
            print(f"preflight     : dsh {sub.preflight()}")
        except RuntimeError as exc:  # soft in dry-run: wiring is still checkable offline
            print(f"preflight     : SKIPPED ({exc})")

        work = root / "work" / "single"
        install = sub.materialise(Path(tree), work)
        print(f"tree          : {tree} (fingerprint {install.fingerprint})")
        print(f"work_dir      : {install.work_dir} ({len(install.files)} files)")
        if install.skipped:
            print(f"skipped       : {', '.join(install.skipped)} (unsupported in MVP)")
        print(sub.execute(install, args.task).describe())
        print(f"--- {install.patch_path.name} ---")
        print(install.patch_path.read_text(encoding="utf-8"), end="")
        print(f"read_trajectory: {len(sub.read_trajectory(install.work_dir))} chars (none expected in dry-run)")

        if args.ppc:
            print("== PPC k=1 skeleton")
            result = run_ppc_stub(
                Path(tree),
                sub,
                DshChannel(profile=args.profile, home_base=root / "homes", dry_run=True),
                runs_root=root / "ppc",
                task=args.task,
            )
            if result.live:
                print("error: PPC dry-run unexpectedly live", file=sys.stderr)
                return 1
            for label, plan in (("base", result.base_plan), ("propose", result.propose_plan), ("probe", result.probe_plan)):
                print(f"[{label}] DSH_HOME={plan.dsh_home} cwd={plan.cwd}")
            print(result.summary())
        print("OK")
        return 0
    finally:
        if cleanup:
            shutil.rmtree(root, ignore_errors=True)


if __name__ == "__main__":
    raise SystemExit(main())
