/**
 * Tool guard on the `tools/pre-execute` waterfall.
 *
 * Two checks, both refusing before dispatch with a `deny` decision (the tool
 * body is skipped and the model sees the reason as a normal error result):
 *
 *   - `denyTools`: exact tool names.
 *   - `denyPathGlobs`: path-valued arguments of any tool. `exec.arguments` is
 *     the parsed, frozen argument object at this point, so the guard reads the
 *     keys in `pathArgKeys` (default `file_path`, `path`, `paths`, `filePath`)
 *     from `read`, `write`, `edit`, `glob`, `grep`, `read_image`, ...
 *
 * Known gaps, by design: the guard sees what the model wrote, not what the
 * filesystem resolves. Symlinks are not followed, `bash` / `pwsh` command
 * strings are not parsed, and PTC `run_code` programs hide paths inside code
 * (their inner `tools.read(...)` sub-calls DO pass through here, but a shell
 * `cat` does not). For a hard boundary use the sandbox / `fs` policy; this is
 * the cheap, observable second line.
 *
 * Network access through dsh's own web tools is switched off by replacing the
 * base `tool-web` row (see `cordis.probe.patch.yml`); `denyTools` is the
 * in-process second line for that.
 */
import { homedir } from 'node:os'
import { posix } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type { PreToolDecision } from '@deepseek-ai/dsh-tools'

export interface GuardConfig {
  /** Tool names refused before dispatch, for example `web_search` and `web_fetch`. */
  denyTools?: string[]
  /**
   * Glob patterns for refused paths. Syntax: `*` (within a segment), `**`
   * (across segments), `?`, and `{a,b}`. A pattern that starts with neither
   * `/` nor `**` matches at any depth, so `secrets/**` equals `**` + `/secrets/**`.
   * Paths are normalized first: `\` becomes `/`, a leading `~/` becomes the
   * home directory, and `.` / `..` segments are collapsed. A directory
   * argument also matches as `dir/`, so `answers/**` refuses `path: answers`.
   */
  denyPathGlobs?: string[]
  /** Argument names that hold paths (string or string array). Default `file_path`, `path`, `paths`, `filePath`. */
  pathArgKeys?: string[]
}

export const DEFAULT_PATH_ARG_KEYS: readonly string[] = ['file_path', 'path', 'paths', 'filePath']

/** Decide one pending call by tool name. */
export function decide(toolName: string, denied: ReadonlySet<string>): PreToolDecision {
  if (denied.has(toolName)) {
    return { kind: 'deny', reason: `Tool "${toolName}" is disabled by dsh-plugin-harness2.` }
  }
  return { kind: 'allow' }
}

/** Translate one glob (see {@link GuardConfig.denyPathGlobs}) into an anchored RegExp. */
export function globToRegExp(glob: string): RegExp {
  let pattern = glob.replaceAll('\\', '/')
  if (!pattern.startsWith('/') && !pattern.startsWith('**')) pattern = `**/${pattern}`
  let source = ''
  let braces = 0
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i]!
    if (ch === '*') {
      if (pattern[i + 1] === '*') {
        if (pattern[i + 2] === '/') {
          source += '(?:.*/)?'
          i += 2
        } else {
          source += '.*'
          i += 1
        }
      } else {
        source += '[^/]*'
      }
    } else if (ch === '?') {
      source += '[^/]'
    } else if (ch === '{') {
      braces++
      source += '(?:'
    } else if (ch === '}' && braces > 0) {
      braces--
      source += ')'
    } else if (ch === ',' && braces > 0) {
      source += '|'
    } else {
      source += ch.replace(/[.+^$()|[\]\\/]/g, '\\$&')
    }
  }
  while (braces-- > 0) source += ')'
  return new RegExp(`^${source}$`)
}

/** Normalize a model-supplied path for glob matching. */
export function normalizePath(path: string, home: string = homedir()): string {
  let value = path.replaceAll('\\', '/')
  if (value === '~' || value.startsWith('~/')) value = `${home.replaceAll('\\', '/')}${value.slice(1)}`
  return posix.normalize(value)
}

/** Collect string values (or string array members) stored under `keys` in an arguments object. */
export function pathValues(args: unknown, keys: readonly string[]): string[] {
  if (typeof args !== 'object' || args === null) return []
  const out: string[] = []
  for (const key of keys) {
    const value = (args as Record<string, unknown>)[key]
    if (typeof value === 'string') out.push(value)
    else if (Array.isArray(value)) for (const item of value) if (typeof item === 'string') out.push(item)
  }
  return out
}

/** The first denied path among the arguments, or `undefined`. */
export function findDeniedPath(
  args: unknown,
  patterns: readonly RegExp[],
  keys: readonly string[] = DEFAULT_PATH_ARG_KEYS,
): string | undefined {
  if (patterns.length === 0) return undefined
  for (const raw of pathValues(args, keys)) {
    const normalized = normalizePath(raw)
    const candidates = normalized.endsWith('/') ? [normalized] : [normalized, `${normalized}/`]
    if (patterns.some(re => candidates.some(candidate => re.test(candidate)))) return raw
  }
  return undefined
}

/**
 * Register the guard listener. Allowed calls delegate to `next()` so other
 * policies keep running; the listener unwinds with the plugin. Registers
 * nothing when neither list is set.
 */
export function registerGuard(ctx: Context, config: GuardConfig = {}): void {
  const denied = new Set(config.denyTools ?? [])
  const patterns = (config.denyPathGlobs ?? []).filter(glob => glob !== '').map(globToRegExp)
  const keys = config.pathArgKeys !== undefined && config.pathArgKeys.length > 0
    ? config.pathArgKeys
    : DEFAULT_PATH_ARG_KEYS
  if (denied.size === 0 && patterns.length === 0) return
  ctx.on('tools/pre-execute', (exec, next) => {
    const byName = decide(exec.name, denied)
    if (byName.kind !== 'allow') return Promise.resolve(byName)
    const path = findDeniedPath(exec.arguments, patterns, keys)
    if (path !== undefined) {
      return Promise.resolve<PreToolDecision>({
        kind: 'deny',
        reason: `Path "${path}" is blocked by dsh-plugin-harness2 (tool "${exec.name}").`,
      })
    }
    return next()
  })
}
