# Phase 2 Report: host plugin seam depth

**Result: PASS.** The three stubs are now usable probe seams, `Config` is a schemastery schema, `npm run build` and `npm test` are green (26 tests, 0 failures), and the plugin still installs and loads in a real dsh profile. This is not a full Harness²: there is no sidecar and no model session has run with it.

Model: claude-sonnet-5-5, effort high. Scope: Phase 2 only. `/workspace/deepseek-harness` and `/workspace/harness2` were not modified (`git status --short` in the dsh repo is empty).

## What changed

| File | Change |
| --- | --- |
| `src/sections.ts` | Each of c1..c4 takes a literal or an absolute file path (`<key>File`). Empty text registers no section. New pure `resolveSections()`. |
| `src/recorder.ts` | Rich JSONL records (tool name, call id, truncated arguments and result text, error, usage, turn end), a companion `[ACTION]/[OBSERVATION]/[ERROR]` text file, a documented truncation limit, and contained failures. |
| `src/guard.ts` | `denyTools` kept. Added `denyPathGlobs` and `pathArgKeys`, checked on `exec.arguments` at `tools/pre-execute`. |
| `src/index.ts` | `export const Config` (schemastery) with defaults and descriptions. |
| `package.json` | New dependency `@deepseek-ai/schemastery` `~3.18.5`. Nothing else changed: `main`, `types`, `exports`, `dsh.bundle.patch`, `files`, unscoped name, peers. No `workspace:`. |
| `cordis.patch.yml`, `cordis.probe.patch.yml` | Restate the new config fields. The `tool-web` disable stays in the probe overlay only. |
| `README.md` | Config reference, precedence, record format, guard limits. |
| `tests/` | New `helpers.mjs`, `sections.test.mjs`, `recorder.test.mjs`, `guard.test.mjs`. `bundle.test.mjs` updated. |

## Config API

```yaml
config:
  sections:
    systemPrompt: ''  / systemPromptFile: ''     # c1
    guardrails: ''    / guardrailsFile: ''       # c2
    memory: ''        / memoryFile: ''           # c3
    toolGuidance: ''  / toolGuidanceFile: ''     # c4
  recorder:
    path: ''          # absolute JSONL path; '' disables
    text: true        # write the text trajectory too
    textPath: ''      # '' means <path>.txt
    maxChars: 16384   # 256..1048576, per field
  guard:
    denyTools: []
    denyPathGlobs: []
    pathArgKeys: [file_path, path, paths, filePath]
```

### Sections

- Names and orders are unchanged: `harness2:c1-system-prompt` 450, `c2-guardrails` 460, `c3-memory` 470, `c4-tool-guidance` 4000. All have `interpolate: false`.
- **Precedence per component:** non-empty `<key>File` wins over the literal. Otherwise the literal. Otherwise nothing.
- A relative path or an unreadable file throws at load. In the live host this appears as `1 entry did not activate` with the plugin's message, so a probe cannot silently run without its section.
- Text that is empty or whitespace-only registers no section. An empty file does not fall back to the literal.
- The file is read once at apply time, not per turn. This keeps the prompt prefix stable.

### Recorder

- Listens on `session/event`, which is post-commit and fire-and-forget. It never touches a waterfall result.
- JSONL: one line per session event of any type, with `v:1`, `sessionId`, `seq`, `time`, `type`, `turn`, `step`.
  - `tool/call`: `tool`, `callId`, raw `arguments` string.
  - `tool/result`: `callId`, `text`, `isError`, `error{name,code,reason}`.
  - `user/message` and `assistant/message`: `text` (assistant also `usage`).
  - `turn/end`: `reason{kind,message?}`.
- Truncation: every free-text field is cut to `maxChars` (default **16384** UTF-16 units, clamped to 256..1048576). The field keeps its prefix plus `…[truncated N chars]`, and the record gets `truncated:true` and `chars` (original length).
- Text file grammar: `[ACTION] name(args-json)`, then `[OBSERVATION] text` or `[ERROR] text`, and `[ERROR] turn ended: msg` for an `error` turn end.
- Parent directories are created on first write. Appends are synchronous, so ordering is preserved.
- A sink or projection failure is caught and logged once through `ctx.logger('harness2')` when available. It never reaches the agent loop.

### Guard

- Pipeline docs read: `docs/tool-execution-pipeline.md` and the `dsh-tools` README. `tools/pre-execute` is a waterfall `(exec, next) => Promise<PreToolDecision>`. A denial returns `{kind:'deny', reason}` without calling `next()`, the tool body is skipped, and the model sees a normal error result. An allow returns `next()` so later policies still run.
- `exec.arguments` is the parsed, frozen argument object at this point, so path arguments **are** visible. The fs tools use `file_path` (`read`, `write`, `edit`, `read_image`) and `path` (`glob`, `grep`).
- Glob syntax: `*`, `**`, `?`, `{a,b}`. A pattern starting with neither `/` nor `**` matches at any depth. Paths are normalized: `\` to `/`, leading `~/` to home, `.`/`..` collapsed. A directory also matches as `dir/`, so `answers/**` refuses `path: answers`.
- The deny reason names the path and the tool, not the glob.
- `tool-web` is still not disabled in the always-on patch. Only `cordis.probe.patch.yml` does that.

### Config schema

`--dump-config-schema` now shows every field with its default and description (`$defs/config66`). Adding `@deepseek-ai/schemastery` as a regular dependency matches the dsh packages and did not break packaging. Schemastery tags schemas with `Symbol.for`, so the host accepts the plugin's own copy. `lib/index.js` now has one external import of it. `npm pack --dry-run` lists the same 11 files as before (13.6 kB).

## Test results

Node 22.23.3 (`PATH=/tmp/pnpm11-shim:/tmp/node22/node_modules/node/bin:$PATH`).

| Command | Result | Log |
| --- | --- | --- |
| `npm run typecheck` | exit 0 | |
| `npm run build` | exit 0, `lib/index.js` 16.6 kB | `out/phase2.build.log` |
| `npm test` | 26 tests, 26 pass, 0 fail | `out/phase2.test.log` |

Coverage:

- **Sections:** file load (UTF-8, braces kept), file over literal, empty or whitespace text, empty file with no fallback, relative and missing path errors, names and orders.
- **Recorder** (tmpdir): JSONL append and text grammar for a success, a tool error and a failed turn; truncation with marker; default 16 KiB and clamping; empty-path no-op; failure containment (a directory as the path, malformed events, `null` arguments) with exactly one warning; multi-session interleave.
- **Guard** (fake ctx): name deny with `next()` skipped; allow delegates to `next()` and returns its decision; path globs across `read`, `glob`, `grep`, `write`; traversal and backslash normalization; `~` expansion; brace and `?` globs; `pathArgKeys`; the documented `bash` gap; no listener when both lists are empty.
- **Bundle:** `Config` defaults, `maxChars` bounds, package contract, patch rows.

## Install re-verification (isolated `DSH_HOME=out/dsh-home-phase15`)

| Check | Result | Artifact |
| --- | --- | --- |
| `dsh --profile headless --dump-config` | exit 0, stderr empty, `id: harness2` row with all new fields and defaults | `out/phase2.dump-config.txt` |
| `dsh --profile headless --dump-config-schema` | exit 0, stderr empty, 608 kB, new fields and descriptions present | `out/phase2.dump-config-schema.json` |
| Boot with a **bad** patch (`systemPromptFile: relative/c1.md`) | `1 entry did not activate`, with the plugin's own error and a stack through `lib/index.js` `apply` | `out/phase2.boot-bad.log` |
| Boot with a **good** patch (file section, literal section, recorder path, deny lists) | No activation warning. Stops at `MISSING_CREDENTIAL`, as in Phase 1.5. | `out/phase2.boot-good.log` |

The bad-patch boot is the first evidence that `apply` really runs inside the host, which Phase 1.5 listed as not covered. Fixtures: `out/phase2.fixtures/`.

## Remaining gaps for Phase 3

1. **No live session.** There is no API key, so I did not see sections reach a real prompt, `traj.jsonl` fill, or the guard deny a real model call. Behaviour against the real event shapes rests on the typed payloads and fake-context tests. The first real run should check `out/phase2.fixtures/traj.jsonl` and its `.txt`.
2. **Guard is name and argument based.** No symlink resolution. `bash`/`pwsh` command text and PTC `run_code` programs are not parsed, so a shell `cat` bypasses `denyPathGlobs`. Relative paths are not resolved against the session working directory. A hard boundary needs the sandbox or `fs` policy.
3. **Recorder scope.**
   - Assistant reasoning and non-text blocks are not recorded.
   - The text file has no `[ASSISTANT]` or `[USER]` lines. It follows only the three-tag grammar; Phase 3 can add them if `DshSubstrate` needs them.
   - There is no rotation, no per-session split, and no token totals beyond the raw `usage`.
   - Writes are synchronous.
   - `tool/ptc-dispatch` sub-call events are written as base records only. The inner `tools.*` calls are not expanded into text actions.
4. **Sections are read once at load.** There is no hot reload, and config changes need a restart.
5. **Hooks bridge.** `dsh-hooks-codex` is still documented, not inserted.
6. **Peers.** The `dsh-*` peers are still `*`, and the dev pin is still `0.2.1-alpha.5` against a host reporting `0.2.1-alpha.2` from source. Nothing broke, but the pairing is untested beyond load.
7. **Runner files.** `out/phase2.run.{log,err}` and `out/phase2.session_id.txt` are the agent runner's capture of this Claude session (stream log, not dsh output). They are not plugin artifacts.

## Reproduce

```sh
export PATH=/tmp/pnpm11-shim:/tmp/node22/node_modules/node/bin:$PATH
cd /workspace/harness2-dsh/packages/dsh-plugin-harness2
npm install && npm run build && npm test
export DSH_HOME=/workspace/harness2-dsh/out/dsh-home-phase15
../../scripts/dsh-src.sh --profile headless --dump-config | grep -A28 "id: harness2"
../../scripts/dsh-src.sh --profile headless --patch /workspace/harness2-dsh/out/phase2.fixtures/bad.patch.yml "say hi" </dev/null
```
