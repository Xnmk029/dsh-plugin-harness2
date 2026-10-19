# Harness² × DeepSeek Harness（dsh）混合方案 MVP

[中文](#中文) · [English](#english)

---

## 中文

把 Google Research [Harness²](https://github.com/google-research/harness2) 的"提出–探测–组合"（Propose–Probe–Compose，PPC）自改进方法接入 DeepSeek Harness（dsh）的最小可用版本。

采用**混合方案 C（旁路进程主导）**：Python 旁路进程（`DshSubstrate` + `dsh` 改进器通道）负责驱动 dsh，一个小型的树外 Cordis 插件包提供进程内的接入点。**不改动 dsh 核心代码。**

> 本项目与 Google LLC、DeepSeek 均无关联。Harness² 使用 Apache-2.0 协议，dsh 使用 MIT 协议。本仓库根目录 `LICENSE` 为 MIT；`packages/` 下的插件包同样为 MIT。

### 目录结构

```
packages/dsh-plugin-harness2/   TypeScript Cordis 插件包：提示词分段、轨迹记录器、工具守卫（已构建，26 个测试）
python/harness2_dsh/            DshSubstrate、dsh 通道、PPC 骨架、dry_run 命令行（见 python/README.md）
examples/                       demo_harness/ 示例目录、candidate.patch.yml 样例、预设草图
docs/                           ARCHITECTURE.md（架构）、NO_REMOTE_GIT.md
scripts/                        dsh-src.sh、smoke_dry_run.sh、pack.sh
phases/                         各阶段的开发提示词与验收报告
```

### 快速试跑（离线，不调用模型）

```sh
./scripts/smoke_dry_run.sh                       # 单元测试 + dry-run + PPC 骨架
cd python
PYTHONPATH=. python3 -m harness2_dsh.dry_run --tree ../examples/demo_harness --ppc
```

dry-run 会打印计划使用的 `DSH_HOME`、`candidate.patch.yml`、轨迹文件路径和命令；即使本机没有 `dsh` 也会正常退出（返回 0）。也可以 `pip install -e python/`，之后用命令 `harness2-dsh-dry-run`。

### 环境变量

| 变量 | 含义 |
|---|---|
| `DSH_BIN` | dsh 可执行文件。默认 `scripts/dsh-src.sh`，否则用 PATH 里的 `dsh`。 |
| `DSH_HOME` | 隔离环境的**根目录**；每次运行使用 `<base>/<run_id>/home`。 |
| `HARNESS2_DSH_LIVE` | 设为 `1` 才允许真正调用模型（同时需要 `dry_run=False`）。默认 dry-run。 |

### 当前进度

| 模块 | 状态 |
|---|---|
| `dsh-plugin-harness2`（分段、记录器、守卫、配置结构） | 完成、已构建并测试；在真实 dsh 中启动到凭据检查一步，`dsh plugin add` 与 `--dump-config` 显示 `id: harness2` |
| `DshSubstrate`：生成、预检、执行（dry-run）、读取轨迹 | 完成；生成的补丁已用真实 `dsh --dump-config` 验证 |
| 真实执行（`headless` 子进程） | 已实现，受两道开关保护；只对假 `dsh` 测试过 |
| 真实执行（`sdk` 配置） | 按 SDK 文档写成，未测试 |
| 改进器通道 `dsh` | 占位实现：除非 `HARNESS2_DSH_LIVE=1`，否则只做 dry-run |
| PPC k=1 骨架 | 仅打通流程（整树复制作为"提出"，取第一个作为"组合"） |
| 账本、盲选、Library、反思 | 未移植（仍留在上游 Harness²） |
| `claude_cli` 通道、Creator 模式递归 | 不在范围内 |
| 发布采纳后的预设 | 只有文档和 `examples/adopted-preset.example.yml` |

目前仓库里的代码**从未发起过任何模型调用**。

### 接入真实 dsh

不要修改 dsh 或 Harness² 的源码目录。先构建一次插件，再让旁路进程为每次运行准备隔离环境（内部执行 `dsh plugin --profile headless add packages/dsh-plugin-harness2`）：

```sh
(cd packages/dsh-plugin-harness2 && npm install && npm run build)   # 需要 Node ≥ 22
export DSH_BIN=/path/to/dsh            # 可选
export DSH_HOME=/path/to/homes-base    # 可选
export HARNESS2_DSH_LIVE=1             # 并以 DshSubstrate(dry_run=False) 构造
```

### 打包

```sh
./scripts/pack.sh
```

打包时排除 `node_modules`、`.venv`、`__pycache__`、`*.egg-info`、日志、`out/`、`_quarantine-selfwrite/`。

### 隐私

不要提交邮箱、私有仓库地址、密钥或令牌。

---

## English

A minimal viable port of Google Research [Harness²](https://github.com/google-research/harness2)'s Propose–Probe–Compose (PPC) self-improvement method onto DeepSeek Harness (dsh).

**Shape C hybrid, sidecar-led:** a Python sidecar (`DshSubstrate` + `dsh` improver channel) drives dsh, and a small out-of-tree Cordis bundle supplies the in-process seams. No dsh core changes.

> Not affiliated with Google LLC or DeepSeek. Harness² is Apache-2.0; dsh is MIT. The root `LICENSE` of this repository is MIT; the plugin package under `packages/` is MIT.

### Layout

```
packages/dsh-plugin-harness2/   TS Cordis bundle: sections, recorder, guard (built, 26 tests)
python/harness2_dsh/            DshSubstrate, dsh channel, PPC stub, dry_run CLI (see python/README.md)
examples/                       demo_harness/ tree, candidate.patch.yml sample, adopted-preset sketch
docs/                           ARCHITECTURE.md, NO_REMOTE_GIT.md
scripts/                        dsh-src.sh, smoke_dry_run.sh, pack.sh
phases/                         per-phase prompts and reports
```

### Quick start (offline, no model)

```sh
./scripts/smoke_dry_run.sh
cd python
PYTHONPATH=. python3 -m harness2_dsh.dry_run --tree ../examples/demo_harness --ppc
```

The dry-run prints the planned `DSH_HOME`, `candidate.patch.yml`, trajectory path and commands, and exits 0 even when `dsh` is unavailable. `pip install -e python/` also works (console script `harness2-dsh-dry-run`).

### Environment variables

| Variable | Meaning |
|---|---|
| `DSH_BIN` | dsh executable. Default `scripts/dsh-src.sh`, else `dsh` on PATH. |
| `DSH_HOME` | Base dir for isolated homes; each run gets `<base>/<run_id>/home`. |
| `HARNESS2_DSH_LIVE` | `1` allows model-reaching runs (needs `dry_run=False` too). Default: dry-run. |

### Status

| Piece | Status |
|---|---|
| `dsh-plugin-harness2` (sections, recorder, guard, config schema) | Done, built, tested; booted in a real dsh to the credential check; `dsh plugin add` + `--dump-config` show `id: harness2` |
| `DshSubstrate`: materialise, preflight, execute (dry-run), read_trajectory | Done; generated patch verified with real `dsh --dump-config` |
| Live `execute` (`headless` subprocess) | Implemented behind two gates; tested only against a fake `dsh` |
| Live `execute` (`sdk` profile) | Written from the SDK README; untested |
| Improver channel `dsh` | Stub: dry-run unless `HARNESS2_DSH_LIVE=1` |
| PPC k=1 skeleton | Wiring only (copy-tree propose, first-pick compose) |
| Ledger, blind selection, Library, reflection | Not ported (stay in upstream Harness²) |
| `claude_cli` channel, Creator-mode recursion | Out of scope |
| Publish adopted preset | Docs + `examples/adopted-preset.example.yml` only |

No model call has been made by any code here.

### Using a real dsh

Do not modify the dsh or Harness² checkouts. Build the plugin once (Node ≥ 22), then let the sidecar provision each isolated home:

```sh
(cd packages/dsh-plugin-harness2 && npm install && npm run build)
export DSH_BIN=/path/to/dsh            # optional
export DSH_HOME=/path/to/homes-base    # optional
export HARNESS2_DSH_LIVE=1             # and construct DshSubstrate(dry_run=False)
```

### Pack

```sh
./scripts/pack.sh
```

Excludes `node_modules`, `.venv`, `__pycache__`, `*.egg-info`, logs, `out/`, `_quarantine-selfwrite/`.

### Privacy

Never commit emails, private repo URLs, keys or tokens.
