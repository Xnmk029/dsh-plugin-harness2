# Phase 1.5 Report: live dsh install and dump-config verification

**Result: PASS.** `dsh-plugin-harness2` installs into a real dsh profile, `--dump-config` shows the `id: harness2` row, and the plugin's schema loads. No packaging or format fix was needed.

Model: claude-sonnet-5-5. Scope: Phase 1.5 only, no Phase 2 work.

## Environment

| Item | Value |
| --- | --- |
| dsh | `/workspace/deepseek-harness`, `dsh --version` = `0.2.1-alpha.2`, run from source (`node --import tsx ... apps/cli/src/bin.ts`) |
| Node | 22.23.3 at `/tmp/node22/node_modules/node/bin` (system Node 20.19.2 untouched; PATH is set per command) |
| pnpm | 11.28.5 (the version the repo pins). `/usr/bin/pnpm` is a corepack shim and fails here. Corepack cannot write to `/usr/local/share/corepack`, and with `COREPACK_HOME=/tmp/corepack-home` it downloads pnpm but its loader throws `ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING`. Workaround: `/tmp/pnpm11-shim/pnpm`, a 2-line sh wrapper that runs `/tmp/corepack-home/pnpm/11.28.5/bin/pnpm.cjs` directly with Node 22. |
| Profile | `headless`, in the isolated `DSH_HOME=/workspace/harness2-dsh/out/dsh-home-phase15` (created fresh) |
| Launcher | `/workspace/harness2-dsh/scripts/dsh-src.sh` (new). It runs the dsh source CLI from the caller's cwd, like the root `pnpm dsh` script but without the `cd`, so `plugin add .` resolves against the plugin dir. |

## Commands (in order)

```sh
export PATH=/tmp/pnpm11-shim:/tmp/node22/node_modules/node/bin:$PATH

# 1. build the plugin
cd /workspace/harness2-dsh/packages/dsh-plugin-harness2 && npm run build      # exit 0, lib/index.js 3.64 kB

# 2. make dsh runnable (in /workspace/deepseek-harness)
pnpm install --frozen-lockfile --ignore-scripts                               # exit 0, log: out/phase15.pnpm-install.log
scripts/dsh-src.sh --version                                                  # 0.2.1-alpha.2

# 3. install into the isolated profile
export DSH_HOME=/workspace/harness2-dsh/out/dsh-home-phase15
cd /workspace/harness2-dsh/packages/dsh-plugin-harness2
../../scripts/dsh-src.sh plugin --profile headless add .                      # exit 0, log: out/phase15.plugin-add.log

# 4. dump config
../../scripts/dsh-src.sh --profile headless --dump-config \
  > ../../out/phase15.dump-config.txt                                         # exit 0, stderr empty
```

`--ignore-workspace-root-check` was not needed.

### Install result

The profile `package.json` after `add .`:

```json
"dependencies": { "dsh-plugin-harness2": "link:/workspace/harness2-dsh/packages/dsh-plugin-harness2" },
"dsh": { "profile": { "bundles": ["@deepseek-ai/dsh-base", "@deepseek-ai/dsh-headless", "dsh-plugin-harness2"] } }
```

pnpm printed one `[WARN]`: a `link:` dependency does not resolve its peerDependencies from the profile's `node_modules`. This is harmless here because `lib/index.js` imports only `node:fs`. Use a `file:` or tarball install if you ever need peers resolved.

### Dump-config assertion

`out/phase15.dump-config.txt` (384 lines) ends with the plugin's bundle layer (`grep -c "id: harness2"` = 1):

```yaml
# == dsh-plugin-harness2
- id: harness2
  name: dsh-plugin-harness2
  config:
    sections: { systemPrompt: '', guardrails: '', memory: '', toolGuidance: '' }
    recorder: { path: '' }
    guard: { denyTools: [] }
```

The patch from `dsh.bundle.patch` was picked up in the expected layer order after `@deepseek-ai/dsh-base` and `@deepseek-ai/dsh-headless`. `--dump-config` composes layers without importing plugins, so it does not prove the module loads. The next two checks cover that.

### Extra verification

1. **Schema dump imports the plugin.** `--dump-config-schema` exits 0 with empty stderr, and the 596 kB schema mentions `"const": "dsh-plugin-harness2"` and the `harness2` entry (artifacts: `out/phase15.dump-config-schema.{json,err}`).
2. **Real boot reaches the LLM layer.** Before this could run, I built the dsh host artifacts, which a source checkout does not include:
   - `tsc -b tsconfig.host.json` (exit 0)
   - `tsdown --env.DSH_BUILD_FACE host` (exit 0)
   - the native `system.node` addon, via `native/system/scripts/build.ts --host-addon-only`. This needed Node-API headers, which the npm `node` package lacks, so I copied `node-api-headers` into `/tmp/node22/node_modules/node/include/node` (exit 0).

   Then `dsh --profile headless "say hi"` (no credentials, stdin closed, `out/phase15.boot.log`) printed:

   ```text
   dsh: MISSING_CREDENTIAL: llm-deepseek: no API key for provider route "deepseek-official"; ...
   ```

   Exit is 1, as expected without an API key. There was no `entry did not activate` warning, no `harness2` error and no crash. I did not supply an API key, so no LLM call was made.
3. **Negative control.** I temporarily replaced the profile's `cordis.patch.yml` with a row naming a nonexistent plugin. Boot then printed `dsh: warning: 1 entry did not activate / harness2-negative-control (dsh-plugin-harness2-does-not-exist): failed to import` (`out/phase15.boot-negative-control.log`). So Loader does report failed entries, and the real `harness2` row was not reported. The profile patch file was restored to `[]` afterwards.

**Not covered:** the boot stops at the credential check, so I did not see `apply` register the c1..c4 sections, recorder or guard at runtime. The no-warning result is only indirect evidence that `apply` ran. A full session needs an API key, and Phase 1's fake-ctx tests cover the apply logic.

## Format fixes applied

None. The `package.json` name resolution, `exports`, the `dsh.bundle.patch` shape, `inject` keys and `Config` were all accepted as-is. No file in `packages/dsh-plugin-harness2/` was edited in this phase.

## Files created or changed

| Path | Note |
| --- | --- |
| `scripts/dsh-src.sh` | New launcher for the dsh source CLI |
| `phases/PHASE1_5_REPORT.md` | This report |
| `out/phase15.*` | Logs and artifacts (dump-config, schema, plugin-add, boot, build logs) |
| `out/dsh-home-phase15/` | Isolated DSH_HOME with the `headless` profile |
| `/workspace/deepseek-harness` | Build artifacts only (`node_modules`, `lib/` outputs, native `system.node`). No tracked source changed; `git status --short` was clean. |
| `/tmp/{node22,pnpm11-shim,corepack-home,napi-headers}` | Tooling, outside the repos |

## Reproduce

```sh
export PATH=/tmp/pnpm11-shim:/tmp/node22/node_modules/node/bin:$PATH
export DSH_HOME=/workspace/harness2-dsh/out/dsh-home-phase15
cd /workspace/harness2-dsh/packages/dsh-plugin-harness2
../../scripts/dsh-src.sh --profile headless --dump-config | grep -A3 "id: harness2"
```
