import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'

// Read per request so tests and deploys can set env after import.
// ponytail: dev fallback key, sessions die on restart. Set SESSION_SECRET in production.
const devKey = randomBytes(32).toString('hex')
const cfg = () => ({
  id: process.env.GOOGLE_CLIENT_ID ?? '',
  secret: process.env.GOOGLE_CLIENT_SECRET ?? '',
  base: process.env.BASE_URL ?? 'http://localhost:3000',
  key: process.env.SESSION_SECRET || devKey,
  tokenUrl: process.env.GOOGLE_TOKEN_URL ?? 'https://oauth2.googleapis.com/token',
})

export interface User { sub: string; email: string; name: string }
type Signed<T> = T & { exp: number }

const mac = (s: string) => createHmac('sha256', cfg().key).update(s).digest('base64url')

export function sign(payload: object, ttlMs: number) {
  const body = Buffer.from(JSON.stringify({ ...payload, exp: Date.now() + ttlMs })).toString('base64url')
  return `${body}.${mac(body)}`
}

export function verify<T>(token: string | undefined): Signed<T> | null {
  const [body, sig] = (token ?? '').split('.')
  if (!body || !sig) return null
  const a = Buffer.from(sig)
  const b = Buffer.from(mac(body))
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  const p = JSON.parse(Buffer.from(body, 'base64url').toString()) as Signed<T>
  return p.exp > Date.now() ? p : null
}

// One-time codes for the desktop leg: the browser carries the code to the app, the app proves it started
// the sign-in with the PKCE verifier. A hijacked loopback request therefore yields nothing.
// ponytail: in-memory, lost on restart (codes live 5 min). Use a shared store if the server scales out.
const codes = new Map<string, { user: User; challenge: string; exp: number }>()

export function issueCode(user: User, challenge: string) {
  for (const [k, v] of codes) if (v.exp < Date.now()) codes.delete(k)
  const code = randomBytes(24).toString('base64url')
  codes.set(code, { user, challenge, exp: Date.now() + 5 * 60_000 })
  return code
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
const cookie = (req: IncomingMessage, name: string) =>
  req.headers.cookie?.split(/;\s*/).map((c) => c.split('=')).find(([k]) => k === name)?.[1]
const setCookie = (res: ServerResponse, name: string, value: string, maxAgeS: number) => {
  const secure = cfg().base.startsWith('https:') ? '; Secure' : ''
  res.appendHeader('set-cookie', `${name}=${value}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAgeS}${secure}`)
}

function page(res: ServerResponse, status: number, title: string, body: string) {
  res.writeHead(status, {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store',
    'x-frame-options': 'DENY',
    'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; img-src data:",
  })
  res.end(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>
<style>
:root{color-scheme:light dark;font:16px/1.5 system-ui,sans-serif}
body{min-height:100vh;margin:0;display:grid;place-items:center;background:Canvas;color:CanvasText}
main{width:min(380px,90vw);padding:32px;text-align:center;border:1px solid color-mix(in srgb,CanvasText 18%,transparent);border-radius:16px}
h1{margin:0 0 8px;font-size:22px}p{margin:0 0 20px;opacity:.7}
a.btn{display:inline-block;padding:10px 18px;border-radius:8px;background:#5b4de0;color:#fff;text-decoration:none;font-weight:600}
a.btn:focus-visible{outline:3px solid #8b7bff;outline-offset:2px}
</style><main><h1>${esc(title)}</h1>${body}</main></html>`)
}

const redirect = (res: ServerResponse, to: string) => void res.writeHead(302, { location: to }).end()

export function logout(res: ServerResponse) {
  setCookie(res, 'session', '', 0)
  redirect(res, '/')
}

export function start(res: ServerResponse, q: URLSearchParams) {
  const c = cfg()
  if (!c.id || !c.secret) return page(res, 500, 'Not configured', '<p>Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET on the server.</p>')
  // Desktop leg sends both a loopback port and a PKCE challenge; the plain web flow sends neither.
  const port = q.get('port')
  const challenge = q.get('challenge')
  if (port || challenge) {
    const n = Number(port)
    if (!/^\d{4,5}$/.test(port ?? '') || n < 1024 || n > 65535 || !/^[\w-]{43}$/.test(challenge ?? '')) {
      return page(res, 400, 'Bad request', '<p>Invalid sign-in request.</p>')
    }
  }
  const state = randomBytes(16).toString('base64url')
  setCookie(res, 'oauth', sign({ state, port, challenge }, 10 * 60_000), 600)
  redirect(
    res,
    'https://accounts.google.com/o/oauth2/v2/auth?' +
      new URLSearchParams({
        client_id: c.id,
        redirect_uri: `${c.base}/auth/google/callback`,
        response_type: 'code',
        scope: 'openid email profile',
        state,
        prompt: 'select_account',
      }),
  )
}

async function googleUser(code: string): Promise<User> {
  const c = cfg()
  const r = await fetch(c.tokenUrl, {
    method: 'POST',
    body: new URLSearchParams({
      code,
      client_id: c.id,
      client_secret: c.secret,
      redirect_uri: `${c.base}/auth/google/callback`,
      grant_type: 'authorization_code',
    }),
  })
  if (!r.ok) throw new Error(`token endpoint ${r.status}`)
  const { id_token } = (await r.json()) as { id_token: string }
  // Straight from Google's token endpoint over TLS, so the signature check is skipped (OIDC Core 3.1.3.7).
  const p = JSON.parse(Buffer.from(id_token.split('.')[1], 'base64url').toString())
  if (p.aud !== c.id || !/^(https:\/\/)?accounts\.google\.com$/.test(p.iss) || p.exp * 1000 < Date.now() || p.email_verified !== true) {
    throw new Error('bad id_token')
  }
  return { sub: p.sub, email: p.email, name: p.name ?? p.email }
}

export async function callback(req: IncomingMessage, res: ServerResponse, q: URLSearchParams) {
  const o = verify<{ state: string; port: string | null; challenge: string | null }>(cookie(req, 'oauth'))
  setCookie(res, 'oauth', '', 0)
  const code = q.get('code')
  if (!o || !code || o.state !== q.get('state')) return page(res, 400, 'Sign-in failed', '<p>Start again from the app.</p>')
  let user: User
  try {
    user = await googleUser(code)
  } catch (e) {
    console.error(e)
    return page(res, 502, 'Sign-in failed', '<p>Google did not accept the sign-in.</p>')
  }
  if (o.port && o.challenge) return redirect(res, `http://127.0.0.1:${o.port}/cb?code=${issueCode(user, o.challenge)}`)
  setCookie(res, 'session', sign(user, 7 * 86_400_000), 7 * 86_400)
  redirect(res, '/')
}

const json = (res: ServerResponse, status: number, body: object) =>
  void res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(body))

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  let s = ''
  for await (const chunk of req) {
    s += chunk
    if (s.length > 4096) throw new Error('body too large')
  }
  return JSON.parse(s)
}

export async function exchange(req: IncomingMessage, res: ServerResponse) {
  let code: unknown, verifier: unknown
  try {
    ;({ code, verifier } = await readJson(req))
  } catch {
    return json(res, 400, { error: 'invalid_request' })
  }
  if (typeof code !== 'string' || typeof verifier !== 'string') return json(res, 400, { error: 'invalid_request' })
  const e = codes.get(code)
  codes.delete(code) // single use, even when the verifier is wrong: no guessing
  if (!e || e.exp < Date.now() || createHash('sha256').update(verifier).digest('base64url') !== e.challenge) {
    return json(res, 400, { error: 'invalid_grant' })
  }
  json(res, 200, { token: sign(e.user, 30 * 86_400_000), user: e.user })
}

// Bearer token for the desktop app, session cookie for apps/web (which forwards it from the browser).
export function me(req: IncomingMessage, res: ServerResponse) {
  const u = verify<User>(req.headers.authorization?.replace(/^Bearer /, '') ?? cookie(req, 'session'))
  if (!u) return json(res, 401, { error: 'unauthorized' })
  json(res, 200, { user: { sub: u.sub, email: u.email, name: u.name } })
}
