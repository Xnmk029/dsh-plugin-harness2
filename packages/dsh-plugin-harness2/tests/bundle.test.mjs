// Loads the built lib/index.js against a fake Cordis context and checks the
// package.json / patch-file contract. Run `npm run build` first.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { Config, apply, inject, name } from '../lib/index.js'
import { fakeCtx, next } from './helpers.mjs'

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const patch = readFileSync(new URL('../cordis.patch.yml', import.meta.url), 'utf8')
const probe = readFileSync(new URL('../cordis.probe.patch.yml', import.meta.url), 'utf8')

test('module exports', () => {
  assert.equal(name, 'dsh-plugin-harness2')
  assert.deepEqual(inject, ['systemPrompt', 'tools', 'sessions'])
})

test('registers only the non-empty literal sections', () => {
  const ctx = fakeCtx()
  apply(ctx, { sections: { systemPrompt: 'keep {{braces}}', toolGuidance: 'tools' } })
  assert.deepEqual(ctx.sections.map(section => section.name), ['harness2:c1-system-prompt', 'harness2:c4-tool-guidance'])
  assert.ok(ctx.sections.every(section => section.interpolate === false))
  assert.equal(ctx.sections[0].text, 'keep {{braces}}')
  const empty = fakeCtx()
  apply(empty, {})
  assert.equal(empty.sections.length, 0)
})

test('Config schema fills defaults for every seam', () => {
  const config = Config({})
  assert.equal(config.sections.systemPromptFile, '')
  assert.equal(config.recorder.path, '')
  assert.equal(config.recorder.text, true)
  assert.equal(config.recorder.maxChars, 16384)
  assert.deepEqual(config.guard.denyTools, [])
  assert.deepEqual(config.guard.pathArgKeys, ['file_path', 'path', 'paths', 'filePath'])
  assert.throws(() => Config({ recorder: { maxChars: 10 } }))
})

test('recorder subscribes to session/event and tolerates a no-op sink', () => {
  const ctx = fakeCtx()
  apply(ctx, {})
  const rec = ctx.listeners.find(l => l.event === 'session/event')
  assert.ok(rec)
  rec.listener({ id: 's1' }, { seq: 1, time: 0, type: 'user/message', data: {} })
})

test('guard is inert without denyTools and denies listed tools', async () => {
  const quiet = fakeCtx()
  apply(quiet, {})
  assert.equal(quiet.listeners.some(l => l.event === 'tools/pre-execute'), false)

  const ctx = fakeCtx()
  apply(ctx, { guard: { denyTools: ['web_fetch'] } })
  const guard = ctx.listeners.find(l => l.event === 'tools/pre-execute').listener
  assert.equal((await guard({ name: 'web_fetch' }, next)).kind, 'deny')
  assert.equal((await guard({ name: 'read' }, next)).kind, 'allow')
})

test('package.json contract', () => {
  assert.equal(pkg.type, 'module')
  assert.equal(pkg.main, 'lib/index.js')
  assert.equal(pkg.types, 'lib/types/index.d.ts')
  assert.deepEqual(pkg.dsh, { bundle: { patch: './cordis.patch.yml' } })
  assert.ok(pkg.keywords.includes('dsh-plugin'))
  for (const key of ['.', './cordis.patch.yml', './package.json']) assert.ok(key in pkg.exports, key)
  assert.equal(pkg.dsh.client, undefined)
  assert.ok(!JSON.stringify(pkg).includes('workspace:'))
  assert.match(pkg.dependencies['@deepseek-ai/schemastery'], /^~?\d/)
  assert.equal(pkg.peerDependencies['@deepseek-ai/schemastery'], undefined)
})

test('patch rows carry stable ids and mount this package', () => {
  assert.match(patch, /^- insert:/m)
  assert.match(patch, /- id: harness2\n\s+name: dsh-plugin-harness2/)
  assert.match(probe, /^- id: tool-web\n\s+disabled: true/m)
  for (const file of [patch, probe]) {
    for (const key of ['systemPromptFile', 'textPath', 'maxChars', 'denyPathGlobs', 'pathArgKeys']) assert.match(file, new RegExp(key))
  }
})
