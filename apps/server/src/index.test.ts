// Run: npm test
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { server } from './index.ts'

process.env.GOOGLE_CLIENT_ID = 'cid'
process.env.GOOGLE_CLIENT_SECRET = 'secret'
process.env.SESSION_SECRET = 'test-secret'

// Fake Google token endpoint: returns whatever id_token payload the test sets.
let claims: object = {}
const idToken = () => `h.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.s`
const good = () => ({ aud: 'cid', iss: 'https://accounts.google.com', exp: Date.now() / 1000 + 60, email_verified: true, sub: '1', email: 'a@b.com', name: 'A' })
const google = createServer((_, res) => res.end(JSON.stringify({ id_token: idToken() })))
await new Promise<void>((r) => google.listen(0, r))
process.env.GOOGLE_TOKEN_URL = `http://127.0.0.1:${(google.address() as AddressInfo).port}/token`

await new Promise<void>((r) => server.listen(0, r))
const base = `http://localhost:${(server.address() as AddressInfo).port}`
const get = (path: string, cookie = '') => fetch(base + path, { redirect: 'manual', headers: cookie ? { cookie } : {} })

assert.deepEqual(await (await get('/health')).json(), { ok: true })
assert.equal((await get('/nope')).status, 404)

// Start a sign-in and return the state plus the oauth cookie, as the browser would hold them.
async function begin(query = '') {
  const r = await get(`/auth/google${query}`)
  assert.equal(r.status, 302)
  const loc = new URL(r.headers.get('location')!)
  assert.equal(loc.host, 'accounts.google.com')
  assert.equal(loc.searchParams.get('client_id'), 'cid')
  return { state: loc.searchParams.get('state')!, oauth: r.headers.getSetCookie()[0].split(';')[0] }
}

const verifier = 'v'.repeat(43)
const challenge = createHash('sha256').update(verifier).digest('base64url')
assert.equal((await get('/auth/google?port=80&challenge=x')).status, 400) // bad port and challenge

// Desktop leg: callback redirects to the loopback port with a one-time code.
async function desktopCode() {
  claims = good()
  const { state, oauth } = await begin(`?port=45678&challenge=${challenge}`)
  const r = await get(`/auth/google/callback?code=c&state=${state}`, oauth)
  const to = new URL(r.headers.get('location')!)
  assert.equal(to.origin, 'http://127.0.0.1:45678')
  return to.searchParams.get('code')!
}
const exchange = (code: string, v: string) => fetch(`${base}/auth/exchange`, { method: 'POST', body: JSON.stringify({ code, verifier: v }) })

assert.equal((await exchange(await desktopCode(), 'w'.repeat(43))).status, 400) // wrong verifier
const code = await desktopCode()
assert.equal((await exchange(code, 'w'.repeat(43))).status, 400)
assert.equal((await exchange(code, verifier)).status, 400) // wrong guess burned the code
const ok = await exchange(await desktopCode(), verifier)
assert.equal(ok.status, 200)
const { token, user } = (await ok.json()) as { token: string; user: { email: string } }
assert.equal(user.email, 'a@b.com')
assert.equal((await fetch(`${base}/me`, { headers: { authorization: `Bearer ${token}` } })).status, 200)
assert.equal((await fetch(`${base}/me`, { headers: { authorization: `Bearer ${token}x` } })).status, 401)
assert.equal((await fetch(`${base}/me`)).status, 401)

// Callback rejects a forged state and a token meant for another client.
const s = await begin()
assert.equal((await get(`/auth/google/callback?code=c&state=forged`, s.oauth)).status, 400)
assert.equal((await get(`/auth/google/callback?code=c&state=${s.state}`)).status, 400) // no cookie
claims = { ...good(), aud: 'other' }
assert.equal((await get(`/auth/google/callback?code=c&state=${s.state}`, s.oauth)).status, 502)

// Web leg: no port, so the callback sets a session cookie, which /me accepts (apps/web forwards it).
claims = good()
const w = await begin()
const done = await get(`/auth/google/callback?code=c&state=${w.state}`, w.oauth)
assert.equal(done.headers.get('location'), '/')
const session = done.headers.getSetCookie().find((c) => c.startsWith('session='))!.split(';')[0]
assert.match(await (await get('/me', session)).text(), /a@b\.com/)

// CORS only for known desktop origins.
const pre = (origin: string) => fetch(`${base}/me`, { method: 'OPTIONS', headers: { origin } })
assert.equal((await pre('tauri://localhost')).headers.get('access-control-allow-origin'), 'tauri://localhost')
assert.equal((await pre('https://evil.example')).headers.get('access-control-allow-origin'), null)

// Remote relay: API client -> server -> desktop host (long-poll) -> back.
const post = (path: string, tok: string | undefined, body: object) =>
  fetch(base + path, { method: 'POST', headers: tok ? { authorization: `Bearer ${tok}` } : {}, body: JSON.stringify(body) })
const getAs = (path: string, tok: string) => fetch(base + path, { headers: { authorization: `Bearer ${tok}` } })

assert.equal((await post('/remote/key', undefined, {})).status, 401)
const { key } = (await (await post('/remote/key', token, {})).json()) as { key: string }
assert.equal((await getAs('/v1/models', key)).status, 503) // no host yet
assert.equal((await getAs('/v1/models', token)).status, 401) // session token is not an API key
assert.equal((await post('/remote/poll', key, {})).status, 401) // API key cannot act as the host

const hosted = post('/remote/poll', token, { models: [{ id: 'claude', name: 'Claude' }, { bad: 1 }] })
for (let i = 0; i < 40 && (await getAs('/v1/models', key)).status !== 200; i++) await new Promise((r) => setTimeout(r, 25))
assert.deepEqual(await (await getAs('/v1/models', key)).json(), { models: [{ id: 'claude', name: 'Claude' }] })
assert.equal((await post('/v1/ask', key, { prompt: '  ' })).status, 400)
assert.equal((await post('/v1/ask', key, { prompt: 'x', mode: 'auto' })).status, 400)

const asked = post('/v1/ask', key, { prompt: 'héllo', models: ['claude'] })
const { job } = (await (await hosted).json()) as { job: { id: string; prompt: string; mode: string; models: string[] } }
assert.deepEqual([job.prompt, job.mode, job.models], ['héllo', 'parallel', ['claude']])
assert.equal((await post('/remote/result', key, { id: job.id })).status, 401)
assert.equal((await post('/remote/result', token, { id: 'nope' })).status, 404)
assert.equal((await post('/remote/result', token, { id: job.id, answers: { claude: 'hi' } })).status, 200)
const reply = await asked
assert.equal(reply.status, 200)
assert.deepEqual(await reply.json(), { answers: { claude: 'hi' }, errors: {}, matrix: null })
assert.equal((await post('/remote/result', token, { id: job.id, answers: {} })).status, 404) // single use

// A host error surfaces as 502; a new key revokes the old one.
const hosted2 = post('/remote/poll', token, { models: [] })
await new Promise((r) => setTimeout(r, 50))
const asked2 = post('/v1/ask', key, { prompt: 'x', mode: 'cross' })
const j2 = ((await (await hosted2).json()) as { job: { id: string } }).job
await post('/remote/result', token, { id: j2.id, error: 'boom' })
assert.deepEqual([(await asked2).status, await (await asked2).json()], [502, { error: 'boom' }])
const { key: key2 } = (await (await post('/remote/key', token, {})).json()) as { key: string }
assert.equal((await getAs('/v1/models', key)).status, 401)
assert.notEqual((await getAs('/v1/models', key2)).status, 401)

server.close()
google.close()
console.log('server ok')
