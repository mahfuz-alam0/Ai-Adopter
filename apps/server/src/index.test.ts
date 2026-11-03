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

server.close()
google.close()
console.log('server ok')
