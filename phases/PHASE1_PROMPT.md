# Phase 1 ONLY — Strict out-of-tree dsh bundle scaffold for `dsh-plugin-harness2`

Model: **claude-sonnet-5-5**, effort **high**. Do not use Opus. Do not implement Python sidecar in this phase. Do not search GitHub for any user account or private repos. Do not `git init` / `git remote` / `git push` / `gh repo`.

## Goal
Create a **format-compatible** DeepSeek Harness out-of-tree Cordis **bundle** package at:

`/workspace/harness2-dsh/packages/dsh-plugin-harness2/`

This phase is about **plugin/bundle format rigor**, not full Harness² logic. Host plugin bodies may be minimal stubs that compile and register, but packaging must match real dsh install expectations.

## Authoritative templates (READ these; do not invent fields)
1. Out-of-tree community-style (preferred shape for publishable plugin):
   - `/workspace/dsh-ascii-ui/plugin-out/dsh-ui-ascii/package.json`
   - `/workspace/dsh-ascii-ui/plugin-out/dsh-ui-ascii/cordis.patch.yml` (if present)
   - build scripts / `files` / `exports` / `lib/` layout there
2. In-tree official bundle:
   - `/workspace/deepseek-harness/packages/experimental/ralph-bundle/package.json`
   - `/workspace/deepseek-harness/packages/experimental/ralph-bundle/cordis.patch.yml`
3. Plugin apply pattern:
   - `/workspace/deepseek-harness/docs/cordis-tutorial/01-first-plugin.md`
   - `/workspace/deepseek-harness/docs/architecture.md` (profiles/bundles/`dsh.bundle.patch`)
4. System prompt section API (for stub registrations):
   - `/workspace/deepseek-harness/packages/core/system-prompt/README.md`
5. Eval constraints:
   - `/workspace/harness2-dsh-eval/out/VERDICT.md`
   - `/workspace/harness2-dsh-eval/out/SEAM_MAP.md` (c1–c4 interpolate:false; recorder; guards; hooks-codex row)

Ignore `/workspace/harness2-dsh/_quarantine-selfwrite/` except as negative example (wrong `main: ./src/index.ts`, incomplete `files`, etc.). Prefer rewriting cleanly.

## Hard English-only / no Chinese inputs
Do not open `*.zh.md` or `*.i18n.yaml`. If you need locale files, write `locale/en.json` only (optional this phase).

## Required package shape (checklist — all must pass)
Create:
```
packages/dsh-plugin-harness2/
  package.json
  cordis.patch.yml
  tsconfig.json
  tsdown.config.mjs   # or equivalent matching dsh-ui-ascii if that uses it
  src/index.ts        # export name + apply(ctx); register interpolate:false sections stubs
  src/sections.ts     # stub section registration
  src/recorder.ts     # stub trajectory listener (tools/post-execute or session/event) — may no-op write
  src/guard.ts        # stub tools/pre-execute / web disable notes
  README.md           # English install notes for `dsh plugin --profile <p> add .`
  locale/en.json      # optional meta.title / meta.description
```

`package.json` MUST:
- `"type": "module"`
- `"main": "lib/index.js"` and `"types": "lib/types/index.d.ts"` (built artifacts, NOT raw src)
- `exports` including `.`, `./cordis.patch.yml`, `./package.json` (client export only if you add client — **this phase is host-only**, so no `dsh.client` unless justified)
- `"dsh": { "bundle": { "patch": "./cordis.patch.yml" } }` exactly in that spirit
- `"files"` listing built `lib/...` + `cordis.patch.yml` (+ locale if any) — do not ship only `src` as runtime
- peerDependencies / dependencies for Cordis and any dsh packages you import — use semver ranges that make sense for out-of-tree (NOT `workspace:*` unless you also document monorepo-only install; prefer `*` or a documented range like the ascii plugin)
- keywords include `dsh-plugin`
- license MIT or Apache-2.0; package name `dsh-plugin-harness2` (no `@deepseek-ai/` scope — out-of-tree)

`cordis.patch.yml` MUST:
- Use insert/replace rows with stable `id`s
- Mount this package's host plugin module as a named row
- Optionally include illustrative rows for `dsh-hooks-codex` with absolute `configPath` placeholder comments in README (configPath must be documentable)
- Match YAML shape used by ralph-bundle / ascii plugin (list of patch ops)

Build:
- Provide `pnpm`/`npm` scripts: at least `build` that emits `lib/index.js` + types
- Run build successfully in this package directory (install deps as needed locally under the package; do not modify `/workspace/deepseek-harness`)
- If peer packages are unavailable to typecheck fully, still emit JS and document the peer install path; prefer getting a real build green

## Out of scope this phase
- Python sidecar / DshSubstrate
- Full Propose–Probe–Compose
- Drive upload, git remotes
- Searching GitHub for user repos
- Changing `/workspace/deepseek-harness` or `/workspace/harness2`

## Acceptance report (write to)
`/workspace/harness2-dsh/phases/PHASE1_REPORT.md` (English) with:
1. File tree
2. Checklist table: each required field PASS/FAIL with evidence (quote package.json keys, patch ids)
3. Diff philosophy vs ralph-bundle and vs dsh-ui-ascii
4. How to install: exact command(s)
5. Known gaps deferred to Phase 2+

Also print a short English summary to stdout when done.
