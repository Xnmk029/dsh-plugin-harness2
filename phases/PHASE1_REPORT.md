# Phase 1 report: `dsh-plugin-harness2` bundle scaffold

Package: `/workspace/harness2-dsh/packages/dsh-plugin-harness2/`
Model: claude-sonnet-5-5. Scope kept to Phase 1: no Python sidecar, no git commands, no GitHub search,
nothing changed under `/workspace/deepseek-harness` or `/workspace/harness2`.

## 1. File tree

```
packages/dsh-plugin-harness2/
  package.json
  package-lock.json            (npm; pnpm is unusable in this sandbox, see section 5)
  cordis.patch.yml             bundle layer: one insert row, id harness2
  cordis.probe.patch.yml       opt-in overlay: replace row for tool-web + harness2 (web off)
  tsconfig.json
  tsdown.config.mjs
  LICENSE                      MIT
  README.md
  .gitignore
  locale/en.json
  src/index.ts                 name, inject, Config, apply(ctx, config)
  src/sections.ts              c1..c4 sections, interpolate:false
  src/recorder.ts              session/event listener, JSONL sink (no-op when path is '')
  src/guard.ts                 tools/pre-execute deny-list
  tests/bundle.test.mjs        6 node:test cases against lib/index.js with a fake ctx
  lib/index.js                 built (3.6 kB, only runtime import is node:fs)
  lib/types/{index,sections,recorder,guard}.d.ts   built
```

The `_quarantine-selfwrite/` directory was only listed (`ls`), none of its files were read. Its known mistakes (raw `src` as `main`, short `files`) were
avoided by following the two templates.

## 2. Checklist

| # | Requirement | Result | Evidence |
|---|---|---|---|
| 1 | Required files present (package.json, cordis.patch.yml, tsconfig.json, tsdown.config.mjs, src/{index,sections,recorder,guard}.ts, README.md, locale/en.json) | PASS | tree above |
| 2 | `"type": "module"` | PASS | `"type": "module"` |
| 3 | `main` / `types` point to built artifacts | PASS | `"main": "lib/index.js"`, `"types": "lib/types/index.d.ts"`; both files exist after `npm run build` |
| 4 | `exports` has `.`, `./cordis.patch.yml`, `./package.json` | PASS | `".": {types: ./lib/types/index.d.ts, default: ./lib/index.js}`, `"./cordis.patch.yml": "./cordis.patch.yml"`, `"./package.json": "./package.json"`; also `./cordis.probe.patch.yml`, `./locale/*.json` |
| 5 | No `dsh.client` (host-only) | PASS | `"dsh": {"bundle": {"patch": "./cordis.patch.yml"}}` is the whole `dsh` field; the test asserts `dsh.client === undefined` |
| 6 | `dsh.bundle.patch` | PASS | same quote as row 5 |
| 7 | `files` ships built `lib/` plus patch and locale, not `src` | PASS | `["lib/index.js","lib/types/**/*.d.ts","cordis.patch.yml","cordis.probe.patch.yml","locale/*.json","LICENSE","README.md"]`; `npm pack --dry-run` lists 11 files, none under `src/` |
| 8 | Peer/dep ranges are out-of-tree sane, no `workspace:*` | PASS | peers: `@deepseek-ai/cordis: ">=4.0.5-alpha.1 <5"`, `dsh-tools`/`dsh-session`/`dsh-system-prompt: "*"`; a test asserts no `workspace:` anywhere in package.json |
| 9 | keywords include `dsh-plugin` | PASS | `["dsh-plugin","deepseek-harness","harness2","bundle"]` |
| 10 | License MIT or Apache-2.0; unscoped name | PASS | `"license": "MIT"`, `"name": "dsh-plugin-harness2"` |
| 11 | patch uses insert/replace rows with stable ids | PASS | `cordis.patch.yml`: `- insert: [ {id: harness2, name: dsh-plugin-harness2, ...} ]`; `cordis.probe.patch.yml`: replace rows `id: tool-web` (`disabled: true`) and `id: harness2` (full config) |
| 12 | Patch mounts this package's host module as a named row | PASS | row `id: harness2` / `name: dsh-plugin-harness2` |
| 13 | Row shape matches ralph-bundle / ascii plugin | PASS | same `- insert:` list-of-ops form; both files parse as valid YAML (checked with the `yaml` package) |
| 14 | hooks-codex rows documentable, absolute `configPath` placeholder | PASS | commented example in `cordis.patch.yml` and README section "Codex hooks bridge" with `configPath: /ABSOLUTE/PATH/TO/.codex/hooks.json` |
| 15 | Sections use `interpolate:false` (c1..c4) | PASS | `src/sections.ts`; test "registers four literal sections" checks every section and that `{{braces}}` text is passed through |
| 16 | Recorder on `tools/post-execute` or `session/event` | PASS | `session/event` in `src/recorder.ts` (see section 5 for why not post-execute) |
| 17 | Guard on `tools/pre-execute`, web-disable notes | PASS | `src/guard.ts`; web-off overlay in `cordis.probe.patch.yml` |
| 18 | `build` script emits `lib/index.js` + types, and runs green | PASS | `npm run build` -> tsc emits `lib/types/*.d.ts`, tsdown emits `lib/index.js` (Node 22.23.3) |
| 19 | Typecheck against real peer types | PASS | `npm run typecheck` is clean against `@deepseek-ai/dsh-{tools,session,system-prompt}@0.2.1-alpha.5` and cordis `4.0.5-alpha.2` from npm |
| 20 | Tests | PASS | `npm test`: 6 pass, 0 fail |
| 21 | Booted inside a real dsh process via `dsh plugin add .` | NOT DONE | see section 5 |

## 3. Diff philosophy

**Versus ralph-bundle (in-tree official bundle).**
- Same bundle contract: `dsh.bundle.patch`, `main`/`types` on built `lib`, `cordis.patch.yml` as the only mount point, `- insert:` rows with ids.
- Ralph is config-only: its `index.ts` is `export {}` and its rows mount other published packages. This package ships its own host code, so it also needs `lib/index.js` and `apply`.
- Ralph uses `workspace:*`/`workspace:~` and `publishConfig`, `repository`, `icon`, and scoped naming. Those are monorepo conventions, so they are dropped here. Peers use `*` or a documented range instead, and the name is unscoped.
- Ralph has no per-version coupling concern. Here dsh checks `dsh-*` peers against its one runtime version and skips a bundle that fails, so exact pre-1.0 pins would be harmful. Hence `*`.

**Versus dsh-ui-ascii (out-of-tree community plugin).**
- Taken as is: `files`/`exports` layout, `keywords: dsh-plugin`, MIT, `locale/*.json` export, the "disable by id" comment in the patch, tsdown with `format: esm`, `platform: node`, `entryFileNames: index.js`.
- Dropped: the whole client half (`dsh.client`, `./client` export, CSS inlining, `SHELL_MODULES`, lightningcss, React). This package is host-only.
- Changed: ascii typechecks through a throwaway tsconfig mapped onto a built dsh checkout (`DSH_ROOT`). Here the peer types come from npm (`0.2.1-alpha.5`), so plain `tsc` works with no checkout. The cost is a tested-against version that differs from the `d7432673` checkout (alpha.2).
- Changed: ascii's host `apply` is empty. Here `apply` registers real, minimal seams and exports `inject`.

## 4. How to install

Local, from this directory (the runtime entry is built output, so build first):

```sh
cd /workspace/harness2-dsh/packages/dsh-plugin-harness2
npm install && npm run build        # needs Node >=22.19
dsh plugin --profile <p> add .
dsh --profile <p> --dump-config     # row id: harness2 should appear
```

From a registry after publishing: `dsh plugin --profile <p> add dsh-plugin-harness2`.
Web-off probe overlay: `dsh --profile headless --patch /ABS/PATH/cordis.probe.patch.yml "<task>"`.

## 5. Notes, deviations, and known gaps

Deviations from the brief, with reasons:
- **Extra file `cordis.probe.patch.yml`.** The brief asks for replace rows, but a replace row in the bundle layer would change the user's profile on install (disabling `tool-web`). It is an opt-in `--patch` overlay instead, and `cordis.patch.yml` stays insert-only.
- **hooks-codex rows are comments, not live rows.** The package is experimental, is not a dependency of this bundle, and `configPath` is machine-specific.
- **Recorder uses `session/event`.** It is an observer (post-commit, contained failures). `tools/post-execute` is a waterfall that decides the result, so a recorder there could change tool output.
- **npm, not pnpm.** `pnpm` fails here (corepack cannot write to `/usr/local/share/corepack`). The `build` script therefore calls `npm run`; pnpm users can run the same scripts.
- **Node 22 was needed for the build.** The sandbox has Node 20.19.2, and tsdown fails on it (`Promise.withResolvers`). I fetched Node 22.23.3 from the npm `node` package into `/tmp/node22` (outside the package) and put it first on `PATH` for the build and tests. `engines.node` is `>=22.19`, matching the ascii plugin. Typecheck alone passes on Node 20.
- **Extra devDependencies not in the ascii plugin:** `unrun` (tsdown's config loader is not auto-installed) and `@types/node` (for `node:fs`).
- **Incidental read of a Chinese file.** A recursive `grep` run against `packages/` printed a few matching lines from a `README.zh.md` in `experimental/hook-protocol`. I did not open any `*.zh.md` or `*.i18n.yaml` file and did not use that content.

Deferred to Phase 2+:
1. **Not booted in a real dsh.** Neither `dsh plugin add .` nor `--dump-config` was run. What is verified is typecheck against the published types, the built module against a fake ctx, `npm pack` contents, and YAML parsing. Unverified: that the Loader accepts the unscoped package name and the `inject` list (`systemPrompt`, `tools`, `sessions`), and that plain-object config with no schema is passed to `apply` unchanged.
2. **Version coverage.** Types were checked against `0.2.1-alpha.5`, not the alpha.2 checkout the eval used. Peer `*` means any dsh version is admitted, so there is no protection against future API drift.
3. **Recorder is a stub.** Records hold only seq/type/time/session id plus tool name and call id. There is no `[ACTION]/[OBSERVATION]/[ERROR]` grammar, no tool arguments or results, no token usage, no file rotation, and `appendFileSync` is synchronous.
4. **Guard is a stub.** It only denies by tool name. There are no `fs/*` path-leak checks and no leak globs.
5. **Sections** take literal config text only. There is no file loading, no c5 subagent rows, and no c6/c7 skill or script wiring. Section orders (450/460/470/4000) are my choice, not allocated by dsh.
6. **No `Config` schema** (schemastery) means the config catalog and `--dump-config-schema` show no fields. Adding it would add a runtime dependency.
7. **Python sidecar, `DshSubstrate`, Propose–Probe–Compose, preset publishing**: out of scope by design.
8. **`locale/en.json`** is exported but nothing was checked to consume `meta.title`/`meta.description`.
