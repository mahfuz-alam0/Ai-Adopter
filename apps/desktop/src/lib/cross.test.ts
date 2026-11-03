// Run: npm test
import assert from 'node:assert/strict'
import { parseVerdicts, reviewPrompt } from './cross.ts'

const text = 'Both fine.\n\n**Claude**: agree\n- ChatGPT: Partial — misses X\nGemini - disagree'
assert.deepEqual(parseVerdicts(text, ['Claude', 'ChatGPT', 'Gemini', 'Grok']), ['agree', 'partial', 'disagree', undefined])
assert.deepEqual(parseVerdicts("Claude: disagree\nmore\nClaude: agree", ['Claude']), ['agree']) // last line wins
assert.deepEqual(parseVerdicts("Claude's answer is wrong", ['Claude']), [undefined]) // prose is not a verdict
assert.match(reviewPrompt('why?', [{ name: 'A', text: 'x' }]), /### A\nx/)
console.log('cross ok')
