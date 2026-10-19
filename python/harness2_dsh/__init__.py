"""Harness² sidecar for DeepSeek Harness (dsh): DshSubstrate, dsh improver channel, PPC stub."""

from .channel import CHANNELS, DshChannel, ImproverResult, make_channel
from .dsh_cli import LiveNotEnabled, RunPlan, live_enabled
from .materialise import Install, materialise_dsh_workspace
from .recursion_stub import PPCResult, run_ppc_stub
from .substrate import DshSubstrate

__version__ = "0.1.0"

__all__ = [
    "CHANNELS",
    "DshChannel",
    "DshSubstrate",
    "ImproverResult",
    "Install",
    "LiveNotEnabled",
    "PPCResult",
    "RunPlan",
    "live_enabled",
    "make_channel",
    "materialise_dsh_workspace",
    "run_ppc_stub",
]
