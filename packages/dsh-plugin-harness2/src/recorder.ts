/**
 * Trajectory recorder. It observes the durable session log through
 * `session/event`, which is post-commit and fire-and-forget: it never mutates
 * a waterfall result, and a failing sink is contained here (and by the host)
 * so it can never fail an append or the agent loop.
 *
 * Output, both append-only:
 *
 *   - `path`: JSONL, one {@link TrajectoryRecord} per session event of any type.
 *     Tool steps carry the call arguments and the result text.
 *   - text trajectory (default `path + '.txt'`, or `textPath`): the shared
 *     `[ACTION]` / `[OBSERVATION]` / `[ERROR]` grammar, one block per tool step
 *     plus an `[ERROR]` line for a turn that ended in failure.
 *
 * Every free-text field (tool arguments, tool result text, message text) is
 * truncated to `maxChars` UTF-16 code units (default 16384, clamped to
 * 256..1048576). A truncated field keeps its prefix, ends with a
 * `…[truncated N chars]` marker, and its record sets `truncated: true` and
 * `chars` to the original length. This sink applies no other cap.
 */
import { appendFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type { Session, SessionEvent } from '@deepseek-ai/dsh-session'

export interface RecorderConfig {
  /** JSONL file to append to. An empty or absent path records nothing (no-op sink). */
  path?: string
  /** Write the `[ACTION]/[OBSERVATION]/[ERROR]` text trajectory too. Default true. Ignored when `path` is empty. */
  text?: boolean
  /** Text trajectory file. Default `<path>.txt`. */
  textPath?: string
  /** Truncation limit per free-text field, in UTF-16 code units. Default 16384; clamped to 256..1048576. */
  maxChars?: number
}

export const DEFAULT_MAX_CHARS = 16384
const MIN_MAX_CHARS = 256
const MAX_MAX_CHARS = 1048576

/** One recorded line. Only the fields relevant to `type` are present. */
export interface TrajectoryRecord {
  /** Record schema version. */
  v: 1
  sessionId: string
  seq: number
  /** Unix epoch milliseconds of the session event. */
  time: number
  /** Session event type, for example `tool/call`. */
  type: string
  turn?: number
  step?: number
  /** `tool/call`: tool name. */
  tool?: string
  /** `tool/call` and `tool/result`: pairing id. */
  callId?: string
  /** `tool/call`: raw arguments JSON string as the model produced it. */
  arguments?: string
  /** `tool/result`, `user/message`, `assistant/message`: text of the text blocks. */
  text?: string
  /** `tool/result`: the call failed. */
  isError?: true
  /** `tool/result`: structured failure identity, when the host attached one. */
  error?: { name: string; code: string; reason?: string }
  /** `assistant/message`: token usage as reported, when any. */
  usage?: unknown
  /** `turn/end`: reason kind, and the failure message for `error`. */
  reason?: { kind: string; message?: string }
  /** Set when `arguments` or `text` was cut; `chars` is then the original length. */
  truncated?: true
  chars?: number
}

export type TrajectorySink = (record: TrajectoryRecord) => void

export function clampMaxChars(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) return DEFAULT_MAX_CHARS
  return Math.min(MAX_MAX_CHARS, Math.max(MIN_MAX_CHARS, Math.trunc(value)))
}

/** Cut `value` to `max` code units, marking the cut. */
function clip(value: string, max: number): { text: string; truncated: boolean } {
  if (value.length <= max) return { text: value, truncated: false }
  return { text: `${value.slice(0, max)}…[truncated ${value.length - max} chars]`, truncated: true }
}

interface BlockLike { type?: unknown; text?: unknown }

/** Join the text blocks; other blocks become `[<type> content]` like the host's own fallback. */
function blocksText(content: unknown): string {
  if (!Array.isArray(content)) return ''
  return (content as BlockLike[])
    .map(block => {
      if (block?.type === 'text' && typeof block.text === 'string') return block.text
      if (block?.type === 'reasoning') return ''
      return `[${String(block?.type ?? 'unknown')} content]`
    })
    .filter(part => part !== '')
    .join('\n')
}

/** Project a session event onto a {@link TrajectoryRecord}. Never throws on odd payloads. */
export function toRecord(session: Session, event: SessionEvent, maxChars: number = DEFAULT_MAX_CHARS): TrajectoryRecord {
  const record: TrajectoryRecord = {
    v: 1,
    sessionId: String(session.id),
    seq: Number(event.seq),
    time: event.time,
    type: event.type,
  }
  const data = event.data as unknown as Record<string, any> | undefined
  if (typeof data?.turn === 'number') record.turn = data.turn
  if (typeof data?.step === 'number') record.step = data.step
  const setText = (key: 'arguments' | 'text', raw: string): void => {
    const { text, truncated } = clip(raw, maxChars)
    record[key] = text
    if (truncated) {
      record.truncated = true
      record.chars = raw.length
    }
  }
  switch (event.type) {
    case 'tool/call':
      record.tool = event.data.name
      record.callId = String(event.data.callId)
      setText('arguments', String(event.data.arguments ?? ''))
      break
    case 'tool/result': {
      const message = event.data.message
      record.callId = String(message.toolCallId)
      if (message.isError) record.isError = true
      if (event.data.error !== undefined) record.error = { ...event.data.error }
      setText('text', blocksText(message.content))
      break
    }
    case 'user/message':
      setText('text', blocksText((data as Record<string, unknown>)['content']))
      break
    case 'assistant/message':
      setText('text', blocksText(event.data.message.content))
      if (event.data.usage !== undefined) record.usage = event.data.usage
      break
    case 'turn/end': {
      const reason = event.data.reason as { kind: string; error?: { message?: string } }
      record.reason = { kind: reason.kind }
      if (reason.error?.message !== undefined) record.reason.message = reason.error.message
      break
    }
    default:
      break
  }
  return record
}

/**
 * Render a record as grammar lines, or `undefined` when it has no place in the
 * text trajectory. `[ACTION]` carries the tool and raw arguments;
 * `[OBSERVATION]` the result text; `[ERROR]` a failed result or a turn that
 * ended in `error`.
 */
export function toTextBlock(record: TrajectoryRecord): string | undefined {
  switch (record.type) {
    case 'tool/call':
      return `[ACTION] ${record.tool ?? 'tool'}(${record.arguments ?? ''})\n`
    case 'tool/result':
      return `${record.isError ? '[ERROR]' : '[OBSERVATION]'} ${record.text ?? ''}\n`
    case 'turn/end':
      return record.reason?.kind === 'error'
        ? `[ERROR] turn ended: ${record.reason.message ?? 'unknown failure'}\n`
        : undefined
    default:
      return undefined
  }
}

/** Where the text trajectory goes for a given config, or `undefined` when it is off. */
export function resolveTextPath(config: RecorderConfig): string | undefined {
  const path = config.path ?? ''
  if (path === '' || config.text === false) return undefined
  return config.textPath !== undefined && config.textPath !== '' ? config.textPath : `${path}.txt`
}

function append(path: string, data: string, ready: Set<string>): void {
  if (!ready.has(path)) {
    mkdirSync(dirname(path), { recursive: true })
    ready.add(path)
  }
  appendFileSync(path, data)
}

/**
 * Sink that appends JSONL to `config.path` and, unless disabled, the text
 * trajectory. An empty path does nothing. The sink throws on I/O failure;
 * {@link registerRecorder} contains that.
 */
export function createFileSink(config: RecorderConfig | string | undefined): TrajectorySink {
  const cfg: RecorderConfig = typeof config === 'string' ? { path: config } : (config ?? {})
  const path = cfg.path ?? ''
  if (path === '') return () => {}
  const textPath = resolveTextPath(cfg)
  const ready = new Set<string>()
  return record => {
    append(path, `${JSON.stringify(record)}\n`, ready)
    if (textPath === undefined) return
    const block = toTextBlock(record)
    if (block !== undefined) append(textPath, block, ready)
  }
}

/**
 * Subscribe the recorder to `session/event`. The listener unwinds with the
 * plugin. `sink` defaults to the file sink named by `config`. Projection and
 * sink errors are caught; the first one per recorder is logged as a warning
 * (when the context has a logger) and later ones are counted silently.
 */
export function registerRecorder(
  ctx: Context,
  config: RecorderConfig = {},
  sink: TrajectorySink = createFileSink(config),
): void {
  const maxChars = clampMaxChars(config.maxChars)
  let failures = 0
  ctx.on('session/event', (session, event) => {
    try {
      sink(toRecord(session, event, maxChars))
    } catch (error) {
      if (failures++ > 0) return
      try {
        const detail = error instanceof Error ? error.message : String(error)
        ;(ctx as { logger?: (name: string) => { warn?: (message: string) => void } })
          .logger?.('harness2')?.warn?.(`recorder write failed (later failures are not reported): ${detail}`)
      } catch {
        // Logging must not become the failure.
      }
    }
  })
}
