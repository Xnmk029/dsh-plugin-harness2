/**
 * Host half of dsh-plugin-harness2: seams that Harness² needs inside a dsh
 * process. This package is host-only (no `dsh.client`). Every import of a dsh or
 * Cordis package is type-only; the one runtime import is `@deepseek-ai/schemastery`
 * (a regular dependency) for the exported {@link Config} schema. Schemastery tags
 * its schemas with `Symbol.for`, so the host accepts them across package copies.
 * @module dsh-plugin-harness2
 */
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-system-prompt'
import type {} from '@deepseek-ai/dsh-tools'
import { DEFAULT_PATH_ARG_KEYS, registerGuard, type GuardConfig } from './guard.js'
import { DEFAULT_MAX_CHARS, registerRecorder, type RecorderConfig } from './recorder.js'
import { registerSections, type SectionsConfig } from './sections.js'

export type { GuardConfig, RecorderConfig, SectionsConfig }
export type { TrajectoryRecord, TrajectorySink } from './recorder.js'

/** Plugin name shown in Plugin Manager and Settings. */
export const name = 'dsh-plugin-harness2'

/** Services this plugin registers into: prompt sections, tool guards, the session log. */
export const inject = ['systemPrompt', 'tools', 'sessions']

/** Plugin config; every field is optional. */
export interface Config {
  sections?: SectionsConfig
  recorder?: RecorderConfig
  guard?: GuardConfig
}

const text = (description: string) => z.string().default('').description(description)
const list = (description: string, fallback: readonly string[] = []) =>
  z.array(z.string()).default([...fallback]).description(description)

/** Config schema shown by `--dump-config-schema`; fills the defaults before `apply` runs. */
export const Config: z<Config> = z.object({
  sections: z.object({
    systemPrompt: text('c1: literal always-on system prompt. Empty registers no section.'),
    systemPromptFile: text('c1: absolute path of a UTF-8 file; wins over systemPrompt.'),
    guardrails: text('c2: literal advisory guardrails.'),
    guardrailsFile: text('c2: absolute path of a UTF-8 file; wins over guardrails.'),
    memory: text('c3: literal long-term memory.'),
    memoryFile: text('c3: absolute path of a UTF-8 file; wins over memory.'),
    toolGuidance: text('c4: literal free-form tool guidance.'),
    toolGuidanceFile: text('c4: absolute path of a UTF-8 file; wins over toolGuidance.'),
  }).description('Literal (interpolate: false) prompt sections c1..c4: a string, or a file path that wins over it.'),
  recorder: z.object({
    path: text('Absolute path of the JSONL trajectory file. Empty disables the recorder.'),
    text: z.boolean().default(true).description('Also write the [ACTION]/[OBSERVATION]/[ERROR] text trajectory.'),
    textPath: text('Text trajectory file. Empty means <path>.txt.'),
    maxChars: z.number().step(1).min(256).max(1048576).default(DEFAULT_MAX_CHARS)
      .description('Truncation limit, in characters, for each tool argument, result, or message text.'),
  }).description('Append-only trajectory recorder on session/event.'),
  guard: z.object({
    denyTools: list('Tool names refused before dispatch, for example web_search and web_fetch.'),
    denyPathGlobs: list('Glob patterns (*, **, ?, {a,b}) for refused path arguments of any tool.'),
    pathArgKeys: list('Argument names that hold paths.', DEFAULT_PATH_ARG_KEYS),
  }).description('Pre-execute guard: tool-name deny-list and path-glob deny-list.'),
})

/** Host plugin body. Each registration unwinds when this plugin unloads. */
export function apply(ctx: Context, config: Config = {}): void {
  registerSections(ctx, config.sections)
  registerRecorder(ctx, config.recorder)
  registerGuard(ctx, config.guard)
}
