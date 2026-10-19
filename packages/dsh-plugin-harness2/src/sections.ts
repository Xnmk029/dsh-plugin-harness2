/**
 * Harness² editable components c1..c4 as literal system-prompt sections.
 *
 * Persona prefix/suffix text is a template, so an unresolved `{{x}}` fails
 * prompt assembly. These sections set `interpolate: false` and carry their
 * text verbatim, braces included.
 *
 * Each component takes its text from a literal string, an absolute file path,
 * or both. Precedence, per component:
 *
 *   1. `<key>File` set (non-empty): the file is read as UTF-8 once, when the
 *      plugin applies, and wins over the literal. A relative path, or a file
 *      that cannot be read, throws, so a misconfigured probe fails at load
 *      instead of silently running without its section.
 *   2. otherwise `<key>`, the literal string.
 *   3. otherwise nothing.
 *
 * Text that is empty or whitespace-only (after the precedence above) registers
 * NO section for that component. Text is otherwise used verbatim: no trimming,
 * no interpolation.
 */
import { readFileSync } from 'node:fs'
import { isAbsolute } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-system-prompt'

/** Section text per Harness² component: a literal string, or an absolute path to a UTF-8 file. */
export interface SectionsConfig {
  /** c1: always-on system prompt (literal). */
  systemPrompt?: string
  /** c1: absolute path of a UTF-8 file; wins over `systemPrompt`. */
  systemPromptFile?: string
  /** c2: advisory guardrails (literal). Enforcement lives in `guard.ts` or a hooks bridge. */
  guardrails?: string
  /** c2: absolute path of a UTF-8 file; wins over `guardrails`. */
  guardrailsFile?: string
  /** c3: long-term memory (literal). */
  memory?: string
  /** c3: absolute path of a UTF-8 file; wins over `memory`. */
  memoryFile?: string
  /** c4: free-form tool guidance (literal). */
  toolGuidance?: string
  /** c4: absolute path of a UTF-8 file; wins over `toolGuidance`. */
  toolGuidanceFile?: string
}

type SectionKey = 'systemPrompt' | 'guardrails' | 'memory' | 'toolGuidance'

interface SectionSpec {
  readonly key: SectionKey
  readonly name: string
  readonly order: number
}

/**
 * External contributions may use any finite order. c1..c3 sit after the
 * deployment persona prefix (0) and before the first-party tool sections
 * (1000+); c4 sits after the tool sections and before the generated tools SDK
 * (5000).
 */
export const SECTION_SPECS: readonly SectionSpec[] = [
  { key: 'systemPrompt', name: 'harness2:c1-system-prompt', order: 450 },
  { key: 'guardrails', name: 'harness2:c2-guardrails', order: 460 },
  { key: 'memory', name: 'harness2:c3-memory', order: 470 },
  { key: 'toolGuidance', name: 'harness2:c4-tool-guidance', order: 4000 },
]

/** One section ready to register. */
export interface ResolvedSection {
  readonly name: string
  readonly order: number
  readonly text: string
  /** Where the text came from: the file path, or `literal`. */
  readonly source: string
}

/** Reads one file as UTF-8; injectable for tests. */
export type TextLoader = (path: string) => string

const readUtf8: TextLoader = path => readFileSync(path, 'utf8')

/**
 * Apply the precedence rules and return only the sections that carry text, in
 * spec order. Throws on a relative or unreadable `*File` path.
 */
export function resolveSections(config: SectionsConfig = {}, load: TextLoader = readUtf8): ResolvedSection[] {
  const resolved: ResolvedSection[] = []
  for (const spec of SECTION_SPECS) {
    const file = config[`${spec.key}File`] ?? ''
    let text: string
    let source: string
    if (file !== '') {
      if (!isAbsolute(file)) {
        throw new Error(`dsh-plugin-harness2: sections.${spec.key}File must be an absolute path, got "${file}"`)
      }
      try {
        text = load(file)
      } catch (cause) {
        const detail = cause instanceof Error ? cause.message : String(cause)
        throw new Error(`dsh-plugin-harness2: cannot read sections.${spec.key}File "${file}": ${detail}`, { cause })
      }
      source = file
    } else {
      text = config[spec.key] ?? ''
      source = 'literal'
    }
    if (text.trim() === '') continue
    resolved.push({ name: spec.name, order: spec.order, text, source })
  }
  return resolved
}

/**
 * Register one `interpolate: false` section per non-empty component.
 * Registration goes through `ctx`, so it unwinds when the plugin unloads.
 * @returns the registered section names, in order.
 */
export function registerSections(ctx: Context, config: SectionsConfig = {}, load?: TextLoader): string[] {
  const sections = resolveSections(config, load)
  for (const section of sections) {
    ctx.systemPrompt.section({
      name: section.name,
      order: section.order,
      text: section.text,
      interpolate: false,
    })
  }
  return sections.map(section => section.name)
}
