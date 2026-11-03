// Run: npm test
import assert from 'node:assert/strict'
import { classify, pick } from './router.ts'
import type { LaneInfo, ProviderId } from './router.ts'

const ok: LaneInfo = { health: 'ready', warm: false }
const lanes = (o: Partial<Record<ProviderId, LaneInfo>> = {}) => ({ claude: ok, chatgpt: ok, gemini: ok, ...o })

assert.equal(classify('refactor this function'), 'code')
assert.equal(classify('draw a logo for my cafe'), 'image')
assert.equal(classify('hello there'), 'chat')

assert.equal(pick('refactor this function', lanes())?.provider, 'claude')
assert.equal(pick('refactor this function', lanes({ claude: { health: 'login-needed', warm: false } }))?.provider, 'chatgpt')
assert.equal(pick('hello', lanes({ gemini: { health: 'ready', warm: true } }))?.provider, 'gemini') // warm bonus breaks the chat tie
assert.equal(pick('hello', lanes(), { provider: 'claude', type: 'chat' })?.provider, 'claude') // sticky
assert.equal(pick('hello', lanes(), { provider: 'claude', type: 'code' })?.provider, 'chatgpt') // type changed, no stickiness

const e = pick('@Gemini refactor this function', lanes())
assert.equal(e?.provider, 'gemini')
assert.equal(e?.prompt, 'refactor this function')
assert.equal(e?.reason, 'explicit')

assert.equal(pick('hi', { claude: { health: 'down', warm: false }, chatgpt: { health: 'down', warm: false }, gemini: { health: 'down', warm: false } }), null)
console.log('router ok')
