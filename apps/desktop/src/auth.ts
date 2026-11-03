import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'

// Public origin of apps/web; it proxies the sign-in and token calls to apps/server.
const AUTH_URL: string = import.meta.env.VITE_AUTH_URL ?? 'http://localhost:3000'
const KEY = 'session'

export interface User { sub: string; email: string; name: string }

// ponytail: token sits in localStorage and its expiry is not checked here. Move it to the OS keychain
// (a Rust command) and call /me on startup if the token starts guarding anything sensitive.
export const currentUser = (): User | null => JSON.parse(localStorage.getItem(KEY) ?? 'null')?.user ?? null
export const signOut = () => localStorage.removeItem(KEY)

const b64url = (b: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

// Browser sign-in: Google blocks sign-in in embedded webviews, so open the default browser and wait for it to
// hand a one-time code back on a loopback port. The PKCE verifier never leaves this process until the exchange.
export async function signIn(): Promise<User> {
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(32)))
  const challenge = b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)))

  // Listen before the port exists so a fast redirect cannot be missed.
  let off = () => {}
  const code = new Promise<string>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('Sign-in timed out')), 300_000)
    void listen<string>('auth-code', (e) => {
      clearTimeout(t)
      resolve(e.payload)
    }).then((un) => (off = un))
  })
  code.catch(() => undefined) // a timeout after an early failure below must not surface as unhandled
  try {
    const port = await invoke<number>('auth_listen')
    await invoke('open_url', { url: `${AUTH_URL}/?${new URLSearchParams({ port: String(port), challenge })}` })
    const r = await fetch(`${AUTH_URL}/auth/exchange`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code: await code, verifier }),
    })
    if (!r.ok) throw new Error('Sign-in was rejected')
    const s = (await r.json()) as { token: string; user: User }
    localStorage.setItem(KEY, JSON.stringify(s))
    return s.user
  } finally {
    off()
  }
}
