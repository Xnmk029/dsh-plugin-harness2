# dsh-plugin-harness2

An out-of-tree DeepSeek Harness (dsh) **bundle** that gives Harness² the in-process seams it needs: literal
system-prompt sections, a trajectory recorder, and tool guards. It is host-only (no browser half). Every dsh and
Cordis import in `src/` is type-only; the one runtime import is `@deepseek-ai/schemastery`, a regular dependency
used for the exported `Config` schema.

**Status: Phase 2 probe seams.** The three seams are usable for probes (see "What it does" and "Known gaps"); this
is not a full Harness² substrate.

## Install

Needs Node `>=22.19` and a dsh install whose runtime version satisfies the peer ranges below.

From a local checkout of this package (build first, because the runtime entry is `lib/index.js`):

```sh
cd packages/dsh-plugin-harness2
npm install && npm run build
dsh plugin --profile <p> add .
```

From a registry, once published: `dsh plugin --profile <p> add dsh-plugin-harness2`.

`dsh plugin add` appends the package to the profile's bundle list. On the next boot the bundle layer
(`dsh.bundle.patch` -> `cordis.patch.yml`) inserts one Loader row, `id: harness2`. Check the result with:

```sh
dsh --profile <p> --dump-config
```

Switch the layer off without uninstalling, from the profile's own `cordis.patch.yml`:

```yaml
- id: harness2
  disabled: true
```

## What it does

| Seam | Source | Behaviour |
|---|---|---|
| Prompt sections c1..c4 | `src/sections.ts` | Registers `harness2:c1-system-prompt` (order 450), `c2-guardrails` (460), `c3-memory` (470) and `c4-tool-guidance` (4000), each `interpolate: false`, so `{{...}}` is kept literally. Text comes from a literal or a file (below). Empty text registers no section. |
| Trajectory recorder | `src/recorder.ts` | Listens on `session/event` (post-commit, never alters a result) and appends JSONL to `recorder.path`, plus an `[ACTION]/[OBSERVATION]/[ERROR]` text file. Errors are contained. |
| Tool guard | `src/guard.ts` | Listens on `tools/pre-execute`. Denies tool names in `denyTools` and path arguments matching `denyPathGlobs`; everything else delegates to `next()`. Registers nothing when both lists are empty. |
| Config schema | `src/index.ts` | `export const Config` (schemastery) fills the defaults and shows the fields in `dsh --dump-config-schema`. |

### Config

All fields are optional; the shipped row restates the defaults:

```yaml
- insert:
    - id: harness2
      name: dsh-plugin-harness2
      config:
        sections:
          systemPrompt: ''         # c1 literal
          systemPromptFile: ''     # c1 absolute path; wins over the literal
          guardrails: ''           # c2
          guardrailsFile: ''
          memory: ''               # c3
          memoryFile: ''
          toolGuidance: ''         # c4
          toolGuidanceFile: ''
        recorder:
          path: ''                 # absolute JSONL path; '' disables the recorder
          text: true               # also write the text trajectory
          textPath: ''             # '' means <path>.txt
          maxChars: 16384          # per-field truncation, 256..1048576
        guard:
          denyTools: []            # e.g. [web_search, web_fetch]
          denyPathGlobs: []        # e.g. ['**/answers/**', '**/.env*']
          pathArgKeys: [file_path, path, paths, filePath]
```

A patch that targets `harness2` by id replaces its whole config, so restate every field you keep.

### Sections: precedence

Per component, in order: (1) `<key>File`, if non-empty, is read once as UTF-8 when the plugin applies and wins over
the literal; a relative path or an unreadable file **throws**, so the entry fails to activate and dsh prints
`1 entry did not activate`; (2) otherwise the literal `<key>`; (3) otherwise nothing. If the resulting text is empty
or whitespace-only, **no section is registered** (an empty file does not fall back to the literal). Text is used
verbatim: no trimming and no `{{...}}` interpolation. The file is read at load, not per turn, so editing it needs a
restart (this keeps the prompt prefix stable for KV-cache reuse).

### Recorder: output

`recorder.path` gets one JSON line per session event of any type (fields only when relevant; `v` is the record
version):

```json
{"v":1,"sessionId":"...","seq":12,"time":1730000000000,"type":"tool/call","turn":1,"step":1,"tool":"read","callId":"call_1","arguments":"{\"file_path\":\"/w/a\"}"}
{"v":1,"sessionId":"...","seq":13,"time":1730000000100,"type":"tool/result","turn":1,"step":1,"callId":"call_1","text":"...","isError":true,"error":{"name":"..","code":".."}}
```

`user/message` and `assistant/message` carry `text` (assistant also `usage`); `turn/end` carries
`reason: {kind, message?}`. Tool arguments, tool result text and message text are cut to `maxChars` (default
16 KiB): the field keeps its prefix plus `…[truncated N chars]`, and the record gets `truncated: true` and `chars`
(original length). Reasoning blocks are not recorded; non-text blocks appear as `[<type> content]`.

The text file (`<path>.txt` or `textPath`) holds `[ACTION] name(raw-arguments-json)`, then `[OBSERVATION] text` or
`[ERROR] text` for a failed result, and `[ERROR] turn ended: <message>` when a turn ends in `error`. Parent
directories are created on first write. Writes are synchronous appends; a failure is caught and logged once, and
never reaches the agent loop. All sessions (including sub-agents) share one file, keyed by `sessionId`.

### Guard: what it can and cannot see

At `tools/pre-execute` the call's parsed, frozen `exec.arguments` is visible, so path globs apply to the
`file_path` / `path` arguments of `read`, `write`, `edit`, `read_image`, `glob`, `grep`, and PTC `tools.*` sub-calls.
Glob syntax: `*`, `**`, `?`, `{a,b}`; a pattern starting with neither `/` nor `**` matches at any depth. Paths are
normalized (`\` to `/`, leading `~/` to the home directory, `..` collapsed) and a directory also matches as `dir/`.

Gaps: no symlink resolution; `bash` / `pwsh` command strings and `run_code` program text are not parsed (a shell
`cat` bypasses `denyPathGlobs`); relative paths are not resolved against the session working directory. Use the
sandbox / `fs` policy for a hard boundary.

## Probe overlay (web off)

`cordis.probe.patch.yml` is an opt-in overlay, not part of the bundle layer. It disables the base `tool-web` row
(replace-by-id) and re-targets `harness2` so the guard also denies `web_search` and `web_fetch`:

```sh
dsh --profile headless \
  --patch /ABSOLUTE/PATH/TO/node_modules/dsh-plugin-harness2/cordis.probe.patch.yml \
  "<task>"
```

## Codex hooks bridge (optional, per machine)

The bundle does not insert `@deepseek-ai/dsh-hooks-codex`: the package is experimental and its `configPath` is
machine-specific. Install it into the same profile, then add a row from your own patch:

```yaml
- insert:
    - id: harness2-hooks-codex
      name: '@deepseek-ai/dsh-hooks-codex'
      config:
        configPath: /ABSOLUTE/PATH/TO/.codex/hooks.json   # placeholder
        model: deepseek-v4
```

Facts that matter for Harness²: the config is read once per process; a relative `configPath` resolves from the
directory that launched dsh, so use an absolute path; a missing or unparsable file logs a warning and runs no hooks.
Only five Codex events are bridged (SessionStart, UserPromptSubmit, PreToolUse, PostToolUse, Stop).

## Peer ranges

| Peer | Range | Why |
|---|---|---|
| `@deepseek-ai/dsh-tools`, `dsh-session`, `dsh-system-prompt` | `*` | dsh checks `dsh-*` peers against its single runtime version, and a pre-1.0 pin would skip the bundle on every other release. The imports are type-only. |
| `@deepseek-ai/cordis` | `>=4.0.5-alpha.1 <5` | The `Context` type and `ctx.on` event API. |

`@deepseek-ai/schemastery` (`~3.18.5`) is a regular dependency, not a peer: it backs `Config`, and schemastery marks
its schemas with `Symbol.for`, so the host accepts them although the plugin resolves its own copy.

Dev dependencies pin `0.2.1-alpha.5` (cordis `4.0.5-alpha.2`) for typechecking. The bundle was booted in a real dsh
process (`0.2.1-alpha.2` from source) as far as the credential check; no model session has run with it yet.

## Develop

```sh
npm install
npm run typecheck   # tsc --noEmit
npm run build       # clean, tsc -> lib/types, tsdown -> lib/index.js
npm test            # node:test against lib/index.js with a fake Cordis context
```

## License

MIT. See `LICENSE`.
