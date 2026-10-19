import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'
import { apply } from '../lib/index.js'
import { fakeCtx } from './helpers.mjs'

const dir = mkdtempSync(join(tmpdir(), 'h2-sections-'))
after(() => rmSync(dir, { recursive: true, force: true }))

test('a file path is loaded as UTF-8 and kept verbatim', () => {
  const file = join(dir, 'c1.md')
  writeFileSync(file, 'héllo {{unresolved}}\nline 2\n', 'utf8')
  const ctx = fakeCtx()
  apply(ctx, { sections: { systemPromptFile: file } })
  assert.equal(ctx.sections.length, 1)
  assert.equal(ctx.sections[0].name, 'harness2:c1-system-prompt')
  assert.equal(ctx.sections[0].order, 450)
  assert.equal(ctx.sections[0].interpolate, false)
  assert.equal(ctx.sections[0].text, 'héllo {{unresolved}}\nline 2\n')
})

test('file wins over the literal; an empty file field falls back to the literal', () => {
  const file = join(dir, 'c2.md')
  writeFileSync(file, 'from file')
  const both = fakeCtx()
  apply(both, { sections: { guardrails: 'literal', guardrailsFile: file } })
  assert.equal(both.sections[0].text, 'from file')
  const literal = fakeCtx()
  apply(literal, { sections: { guardrails: 'literal', guardrailsFile: '' } })
  assert.equal(literal.sections[0].text, 'literal')
})

test('empty or whitespace-only text registers no section, even from a file', () => {
  const file = join(dir, 'blank.md')
  writeFileSync(file, ' \n\t\n')
  const ctx = fakeCtx()
  apply(ctx, { sections: { memoryFile: file, systemPrompt: '  ', toolGuidance: '' } })
  assert.equal(ctx.sections.length, 0)
})

test('a file that is empty does not fall back to the literal', () => {
  const file = join(dir, 'empty.md')
  writeFileSync(file, '')
  const ctx = fakeCtx()
  apply(ctx, { sections: { memory: 'literal', memoryFile: file } })
  assert.equal(ctx.sections.length, 0)
})

test('relative and missing paths fail at load with a clear message', () => {
  assert.throws(() => apply(fakeCtx(), { sections: { memoryFile: 'rel/c3.md' } }), /memoryFile must be an absolute path/)
  assert.throws(() => apply(fakeCtx(), { sections: { toolGuidanceFile: join(dir, 'nope.md') } }), /cannot read sections.toolGuidanceFile/)
})

test('all four components keep their documented names and orders', () => {
  const ctx = fakeCtx()
  apply(ctx, { sections: { systemPrompt: 'a', guardrails: 'b', memory: 'c', toolGuidance: 'd' } })
  assert.deepEqual(
    ctx.sections.map(s => [s.name, s.order]),
    [['harness2:c1-system-prompt', 450], ['harness2:c2-guardrails', 460], ['harness2:c3-memory', 470], ['harness2:c4-tool-guidance', 4000]],
  )
})
