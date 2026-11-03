// Run: npm test
import assert from 'node:assert/strict'
import { formatTrace } from './devlog.ts'

const m = { enq: 1000, start: 1000, ask0: 1010, sentEval: 1050, psend: 1040, pclick: 1060, preq: 1070, phead: 5000, pchunk: 5200, pend: 8800, done: 8920, cold: 0 }
const out = formatTrace('deepseek', false, m, [['/api/v0/chat/create_pow_challenge', 80, 2900, 200]], { n: 10, rtt: 300, rttMax: 90, toPage: 100, toPageMax: 40, fromPage: 200, fromPageMax: 50 })
assert.match(out, /^\[deepseek\] 7\.92s total \(warm lane\)/)
assert.match(out, /\+ 3930ms .* page: reply response headers/) // the gap the log exists to expose
assert.match(out, /req \+80ms after send, headers in 2900ms, 200 \/api\/v0\/chat\/create_pow_challenge/)
assert.match(out, /polls 10: eval round trip avg 30ms max 90ms/)
// order follows the clock, not the mark names
assert.ok(out.indexOf('page: send() entered') < out.indexOf('send eval returned'))
console.log('devlog ok')
