import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'
import { apply } from '../lib/index.js'
import { fakeCtx, toolCall, toolResult } from './helpers.mjs'

const dir = mkdtempSync(join(tmpdir(), 'h2-recorder-'))
after(() => rmSync(dir, { recursive: true, force: true }))
const session = { id: 's1' }
const lines = file => readFileSync(file, 'utf8').trimEnd().split('\n')

test('appends JSONL for a tool step and writes the text trajectory beside it', () => {
  const path = join(dir, 'nested', 'traj.jsonl')
  const ctx = fakeCtx()
  apply(ctx, { recorder: { path } })
  const record = ctx.listener('session/event')
  record(session, { type: 'user/message', seq: 0, time: 999, data: { content: [{ type: 'text', text: 'do it' }] } })
  record(session, toolCall('c1', 'read', { file_path: '/w/a.txt' }))
  record(session, toolResult('c1', 'hello'))
  record(session, toolCall('c2', 'bash', { command: 'false' }))
  record(session, toolResult('c2', 'exit 1', { isError: true, error: { name: 'ToolError', code: 'EXIT', reason: 'bad' } }))
  record(session, { type: 'turn/end', seq: 9, time: 1002, data: { turn: 1, reason: { kind: 'error', error: { message: 'boom', code: 'X' } } } })

  const rows = lines(path).map(line => JSON.parse(line))
  assert.deepEqual(rows.map(r => r.type), ['user/message', 'tool/call', 'tool/result', 'tool/call', 'tool/result', 'turn/end'])
  assert.equal(rows[0].text, 'do it')
  assert.deepEqual(
    { v: rows[1].v, sessionId: rows[1].sessionId, time: rows[1].time, tool: rows[1].tool, callId: rows[1].callId, turn: rows[1].turn },
    { v: 1, sessionId: 's1', time: 1000, tool: 'read', callId: 'c1', turn: 1 },
  )
  assert.equal(rows[1].arguments, '{"file_path":"/w/a.txt"}')
  assert.equal(rows[2].callId, 'c1')
  assert.equal(rows[2].text, 'hello')
  assert.equal(rows[2].isError, undefined)
  assert.equal(rows[4].isError, true)
  assert.deepEqual(rows[4].error, { name: 'ToolError', code: 'EXIT', reason: 'bad' })
  assert.deepEqual(rows[5].reason, { kind: 'error', message: 'boom' })

  assert.equal(
    readFileSync(`${path}.txt`, 'utf8'),
    '[ACTION] read({"file_path":"/w/a.txt"})\n[OBSERVATION] hello\n'
    + '[ACTION] bash({"command":"false"})\n[ERROR] exit 1\n[ERROR] turn ended: boom\n',
  )
})

test('truncates long arguments and results and marks the record', () => {
  const path = join(dir, 'trunc.jsonl')
  const ctx = fakeCtx()
  apply(ctx, { recorder: { path, maxChars: 300, textPath: join(dir, 'trunc.txt') } })
  const record = ctx.listener('session/event')
  record(session, toolResult('c1', 'x'.repeat(1000)))
  record(session, toolResult('c2', 'short'))
  const [long, short] = lines(path).map(line => JSON.parse(line))
  assert.equal(long.truncated, true)
  assert.equal(long.chars, 1000)
  assert.equal(long.text, `${'x'.repeat(300)}…[truncated 700 chars]`)
  assert.equal(short.truncated, undefined)
  assert.match(readFileSync(join(dir, 'trunc.txt'), 'utf8'), /truncated 700 chars\]\n\[OBSERVATION\] short\n/)
})

test('the default limit is 16 KiB and out-of-range maxChars is clamped', () => {
  const path = join(dir, 'limit.jsonl')
  const ctx = fakeCtx()
  apply(ctx, { recorder: { path, text: false } })
  ctx.listener('session/event')(session, toolResult('c1', 'y'.repeat(20000)))
  const [row] = lines(path).map(line => JSON.parse(line))
  assert.equal(row.chars, 20000)
  assert.ok(row.text.startsWith('y'.repeat(16384)))
  assert.equal(existsSync(`${path}.txt`), false)

  const tiny = join(dir, 'tiny.jsonl')
  const ctx2 = fakeCtx()
  apply(ctx2, { recorder: { path: tiny, text: false, maxChars: 1 } })
  ctx2.listener('session/event')(session, toolResult('c1', 'z'.repeat(1000)))
  assert.equal(JSON.parse(lines(tiny)[0]).text.startsWith('z'.repeat(256) + '…'), true)
})

test('an empty path registers a no-op sink and writes nothing', () => {
  const ctx = fakeCtx()
  apply(ctx, { recorder: { path: '', textPath: join(dir, 'never.txt') } })
  ctx.listener('session/event')(session, toolCall('c1', 'read', {}))
  assert.equal(existsSync(join(dir, 'never.txt')), false)
})

test('sink and projection failures are contained and reported once', () => {
  // A directory where the file should be makes every append throw.
  const ctx = fakeCtx()
  apply(ctx, { recorder: { path: dir, text: false } })
  const record = ctx.listener('session/event')
  assert.doesNotThrow(() => record(session, toolCall('c1', 'read', {})))
  assert.doesNotThrow(() => record(session, toolCall('c2', 'read', {})))
  assert.equal(ctx.warnings.length, 1)
  assert.match(ctx.warnings[0], /recorder write failed/)
  // Malformed payloads must not throw out of the listener either.
  assert.doesNotThrow(() => record(session, { type: 'tool/result', seq: 1, time: 1, data: {} }))
  assert.doesNotThrow(() => record(null, null))
})

test('records from several sessions interleave in one file, keyed by sessionId', () => {
  const path = join(dir, 'multi.jsonl')
  const ctx = fakeCtx()
  apply(ctx, { recorder: { path, text: false } })
  const record = ctx.listener('session/event')
  record({ id: 'a' }, toolCall('c1', 'read', {}))
  record({ id: 'b' }, toolCall('c1', 'read', {}))
  assert.deepEqual(lines(path).map(line => JSON.parse(line).sessionId), ['a', 'b'])
})

