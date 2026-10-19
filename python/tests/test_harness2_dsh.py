import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from harness2_dsh import DshChannel, DshSubstrate, LiveNotEnabled, make_channel, run_ppc_stub
from harness2_dsh import dsh_cli

ROOT = Path(__file__).resolve().parents[2]
TREE = ROOT / "examples" / "demo_harness"


class MaterialiseTests(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp(prefix="h2dsh-test-"))
        self.addCleanup(lambda: __import__("shutil").rmtree(self.tmp, ignore_errors=True))

    def test_copies_files_and_generates_patch(self):
        inst = DshSubstrate().materialise(TREE, self.tmp / "w")
        for rel in ("systemprompt.md", ".agents/skills/demo-skill/SKILL.md", "scripts/hello.py", ".codex/hooks.json"):
            self.assertTrue((inst.work_dir / rel).is_file(), rel)
        patch = inst.patch_path.read_text()
        self.assertIn("- id: harness2", patch)
        self.assertIn(f'systemPromptFile: "{inst.work_dir / "systemprompt.md"}"', patch)
        self.assertIn(f'path: "{inst.recorder_path}"', patch)
        self.assertTrue(str(inst.recorder_path).startswith(str(inst.work_dir)))
        self.assertNotIn("harness2-hooks-codex", patch)  # hooks are opt-in

    def test_rejects_non_tree_and_dirty_workdir(self):
        with self.assertRaises(ValueError):
            DshSubstrate().materialise(self.tmp, self.tmp / "w")
        dirty = self.tmp / "dirty"
        dirty.mkdir()
        (dirty / "x").write_text("x")
        with self.assertRaises(FileExistsError):
            DshSubstrate().materialise(TREE, dirty)

    def test_hooks_opt_in_only_when_nonempty(self):
        tree = self.tmp / "tree"
        __import__("shutil").copytree(TREE, tree)
        (tree / ".codex" / "hooks.json").write_text('{"hooks": {"Stop": [{"hooks": []}]}}')
        inst = DshSubstrate(enable_hooks=True).materialise(tree, self.tmp / "w")
        self.assertIn("harness2-hooks-codex", inst.patch_path.read_text())

    def test_read_trajectory(self):
        sub = DshSubstrate()
        inst = sub.materialise(TREE, self.tmp / "w")
        self.assertEqual(sub.read_trajectory(inst.work_dir), "")
        inst.recorder_path.parent.mkdir(parents=True, exist_ok=True)
        inst.recorder_path.write_text(
            '{"type":"tool/call","tool":"bash","arguments":"{}"}\n{"type":"tool/result","text":"ok"}\n{torn'
        )
        self.assertEqual(sub.read_trajectory(inst.work_dir), "[ACTION] bash({})\n[OBSERVATION] ok")
        inst.recorder_text_path.write_text("[ACTION] x()")
        self.assertEqual(sub.read_trajectory(inst.work_dir), "[ACTION] x()")


class ExecuteTests(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp(prefix="h2dsh-test-"))
        self.addCleanup(lambda: __import__("shutil").rmtree(self.tmp, ignore_errors=True))

    def test_dry_run_plans_unique_homes_and_never_spawns(self):
        sub = DshSubstrate(home_base=self.tmp / "homes")
        inst = sub.materialise(TREE, self.tmp / "w")
        with mock.patch("subprocess.run") as run:
            a, b = sub.execute(inst), sub.execute(inst)
        run.assert_not_called()
        self.assertNotEqual(a.dsh_home, b.dsh_home)
        self.assertEqual(a.cwd, inst.work_dir)
        self.assertIn("--patch", a.commands[-1])
        self.assertIn(str(inst.patch_path), a.commands[-1])
        self.assertFalse((self.tmp / "homes").exists())  # planning creates nothing

    def test_live_requires_env_gate(self):
        sub = DshSubstrate(dry_run=False, home_base=self.tmp / "homes")
        inst = sub.materialise(TREE, self.tmp / "w")
        with mock.patch.dict(os.environ, {}, clear=False):
            os.environ.pop("HARNESS2_DSH_LIVE", None)
            with self.assertRaises(LiveNotEnabled):
                sub.execute(inst)

    def test_dsh_bin_env_and_preflight(self):
        fake = self.tmp / "fake-dsh"
        fake.write_text("#!/bin/sh\necho 9.9.9-test\n")
        fake.chmod(0o755)
        with mock.patch.dict(os.environ, {"DSH_BIN": str(fake)}):
            self.assertEqual(DshSubstrate().preflight(), "9.9.9-test")
        with mock.patch.dict(os.environ, {"DSH_BIN": str(self.tmp / "missing")}):
            with self.assertRaises(RuntimeError):
                DshSubstrate().preflight()

    def test_live_runs_fake_dsh(self):
        fake = self.tmp / "fake-dsh"
        fake.write_text('#!/bin/sh\necho "home=$DSH_HOME cwd=$(pwd) args=$*"\n')
        fake.chmod(0o755)
        sub = DshSubstrate(dry_run=False, home_base=self.tmp / "homes")
        inst = sub.materialise(TREE, self.tmp / "w")
        with mock.patch.dict(os.environ, {"DSH_BIN": str(fake), "HARNESS2_DSH_LIVE": "1"}):
            plan = sub.execute(inst, "do it")
        out = (inst.work_dir / ".harness2" / "stdout.txt").read_text()
        self.assertIn(f"home={plan.dsh_home}", out)
        self.assertIn(f"cwd={inst.work_dir}", out)
        self.assertIn("--patch", out)


class ChannelAndPPCTests(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp(prefix="h2dsh-test-"))
        self.addCleanup(lambda: __import__("shutil").rmtree(self.tmp, ignore_errors=True))

    def test_claude_cli_not_implemented(self):
        with self.assertRaises(ValueError):
            make_channel("claude_cli")
        self.assertIsInstance(make_channel("dsh"), DshChannel)

    def test_channel_dry_run_cwd_is_context(self):
        ctx = self.tmp / "ctx"
        ctx.mkdir()
        with mock.patch.dict(os.environ, {}, clear=False):
            os.environ.pop("HARNESS2_DSH_LIVE", None)
            res = DshChannel(home_base=self.tmp / "h").run("improve", ctx)
        self.assertFalse(res.live)
        self.assertEqual(res.plan.cwd, ctx.resolve())

    def test_forced_dry_run_ignores_live_env(self):
        ctx = self.tmp / "ctx"
        ctx.mkdir()
        with mock.patch.dict(os.environ, {"HARNESS2_DSH_LIVE": "1"}), mock.patch("subprocess.run") as run:
            res = DshChannel(home_base=self.tmp / "h", dry_run=True).run("improve", ctx)
        run.assert_not_called()
        self.assertFalse(res.live)

    def test_ppc_stub(self):
        res = run_ppc_stub(
            TREE,
            DshSubstrate(home_base=self.tmp / "h"),
            DshChannel(home_base=self.tmp / "h", dry_run=True),
            runs_root=self.tmp / "ppc",
        )
        self.assertFalse(res.live)
        self.assertEqual((res.rollouts, res.sessions, res.chosen), (2, 1, "cand1"))
        self.assertTrue((res.chosen_tree / "systemprompt.md").is_file())
        homes = {res.base_plan.dsh_home, res.propose_plan.dsh_home, res.probe_plan.dsh_home}
        self.assertEqual(len(homes), 3)


class CliTests(unittest.TestCase):
    def test_dry_run_cli_exits_zero_offline(self):
        env = {**os.environ, "DSH_BIN": "/nonexistent/dsh"}  # preflight must be soft in dry-run
        proc = subprocess.run(
            [sys.executable, "-m", "harness2_dsh.dry_run", "--tree", str(TREE), "--ppc"],
            capture_output=True, text=True, env=env,
        )
        self.assertEqual(proc.returncode, 0, proc.stderr)
        self.assertIn("PPC stub k=1", proc.stdout)
        self.assertIn("OK", proc.stdout)


if __name__ == "__main__":
    unittest.main()
