import assert from 'node:assert/strict'
import { test } from 'node:test'
import { apply } from '../lib/index.js'
import { fakeCtx, next } from './helpers.mjs'

function guardFor(guard) {
  const ctx = fakeCtx()
  apply(ctx, { guard })
  return ctx.listener('tools/pre-execute')
}

const call = (name, args) => ({ name, arguments: args, callId: 'c1' })

test('denyTools denies by name with a reason and skips next()', async () => {
  const guard = guardFor({ denyTools: ['web_fetch', 'web_search'] })
  let reached = false
  const spy = async () => { reached = true; return { kind: 'allow' } }
  const denied = await guard(call('web_fetch', { url: 'http://x' }), spy)
  assert.equal(denied.kind, 'deny')
  assert.match(denied.reason, /web_fetch/)
  assert.equal(reached, false)
  assert.equal((await guard(call('read', { file_path: '/a' }), spy)).kind, 'allow')
  assert.equal(reached, true)
})

test('allowed calls return whatever next() decides, so later policies still run', async () => {
  const guard = guardFor({ denyTools: ['x'] })
  const ask = { kind: 'ask', reason: 'confirm' }
  assert.deepEqual(await guard(call('read', {}), async () => ask), ask)
})

test('denyPathGlobs refuses path arguments of fs tools', async () => {
  const guard = guardFor({ denyPathGlobs: ['**/answers/**', '*.key', '/etc/shadow', '**/.env*'] })
  const verdict = async (name, args) => (await guard(call(name, args), next)).kind
  assert.equal(await verdict('read', { file_path: '/work/answers/gold.json' }), 'deny')
  assert.equal(await verdict('read', { file_path: 'answers/gold.json' }), 'deny')
  assert.equal(await verdict('glob', { path: '/work/answers', pattern: '*' }), 'deny')
  assert.equal(await verdict('grep', { pattern: 'x', path: '/work/answers/' }), 'deny')
  assert.equal(await verdict('write', { file_path: '/home/u/id.key', content: '' }), 'deny')
  assert.equal(await verdict('read', { file_path: '/etc/shadow' }), 'deny')
  assert.equal(await verdict('read', { file_path: '/work/.env.local' }), 'deny')
  assert.equal(await verdict('read', { paths: ['/ok/a', '/work/answers/b'] }), 'deny')
  // normalization defeats simple traversal
  assert.equal(await verdict('read', { file_path: '/work/src/../answers/gold.json' }), 'deny')
  assert.equal(await verdict('read', { file_path: '\\work\\answers\\gold.json' }), 'deny')
  // not matched
  assert.equal(await verdict('read', { file_path: '/work/src/answers_helper.py' }), 'allow')
  assert.equal(await verdict('read', { file_path: '/work/src/main.py' }), 'allow')
  assert.equal(await verdict('bash', { command: 'cat /work/answers/gold.json' }), 'allow') // documented gap
  assert.equal(await verdict('read', undefined), 'allow')
  assert.equal(await verdict('read', 'not-an-object'), 'allow')
})

test('the deny reason names the path and the tool, not the pattern', async () => {
  const guard = guardFor({ denyPathGlobs: ['**/secret/**'] })
  const decision = await guard(call('read', { file_path: '/w/secret/k' }), next)
  assert.match(decision.reason, /\/w\/secret\/k/)
  assert.match(decision.reason, /"read"/)
  assert.doesNotMatch(decision.reason, /\*\*/)
})

test('pathArgKeys overrides which arguments are inspected', async () => {
  const guard = guardFor({ denyPathGlobs: ['**/secret/**'], pathArgKeys: ['target'] })
  assert.equal((await guard(call('custom', { target: '/w/secret/x' }), next)).kind, 'deny')
  assert.equal((await guard(call('read', { file_path: '/w/secret/x' }), next)).kind, 'allow')
})

test('brace and ? globs, and a leading ~ expands to the home directory', async () => {
  const home = (await import('node:os')).homedir()
  const guard = guardFor({ denyPathGlobs: ['**/*.{pem,key}', `${home}/.ssh/**`, 'id_?sa'] })
  const verdict = async file_path => (await guard(call('read', { file_path }), next)).kind
  assert.equal(await verdict('/a/b/c.pem'), 'deny')
  assert.equal(await verdict('/a/b/c.key'), 'deny')
  assert.equal(await verdict('/a/b/c.txt'), 'allow')
  assert.equal(await verdict('~/.ssh/id_rsa'), 'deny')
  assert.equal(await verdict('/x/id_rsa'), 'deny')
  assert.equal(await verdict('/x/id_rsaa'), 'allow')
})

test('the two lists compose and an empty config registers no listener', async () => {
  const guard = guardFor({ denyTools: ['web_fetch'], denyPathGlobs: ['**/s/**'] })
  assert.equal((await guard(call('web_fetch', {}), next)).kind, 'deny')
  assert.equal((await guard(call('read', { file_path: '/s/x' }), next)).kind, 'deny')
  assert.equal((await guard(call('read', { file_path: '/t/x' }), next)).kind, 'allow')
  const quiet = fakeCtx()
  apply(quiet, { guard: { denyTools: [], denyPathGlobs: [''] } })
  assert.equal(quiet.listener('tools/pre-execute'), undefined)
})
