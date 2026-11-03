// Run: npm test
import assert from 'node:assert/strict'
import { server } from './index.ts'

await new Promise<void>((r) => server.listen(0, r))
const { port } = server.address() as { port: number }
const ok = await fetch(`http://localhost:${port}/health`)
assert.deepEqual(await ok.json(), { ok: true })
assert.equal((await fetch(`http://localhost:${port}/nope`)).status, 404)
server.close()
console.log('server ok')
