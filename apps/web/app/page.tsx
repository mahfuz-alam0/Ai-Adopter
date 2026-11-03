import { cookies } from 'next/headers'

const server = process.env.SERVER_URL ?? 'http://localhost:4000'

// The session cookie is signed by apps/server, so ask it who this is instead of sharing the secret.
async function sessionUser() {
  const session = (await cookies()).get('session')?.value
  if (!session) return null
  const r = await fetch(`${server}/me`, { headers: { cookie: `session=${session}` }, cache: 'no-store' })
  return r.ok ? ((await r.json()) as { user: { email: string; name: string } }).user : null
}

type Q = Promise<Record<string, string | string[] | undefined>>

// Plain <a>, not <Link>: Link prefetches, and a prefetched /logout would sign the user out.
export default async function Home({ searchParams }: { searchParams: Q }) {
  const { port, challenge } = await searchParams
  // The desktop app opens this page with its loopback port and PKCE challenge; the server validates both.
  const desktop = typeof port === 'string' && typeof challenge === 'string'
  const user = desktop ? null : await sessionUser()

  return (
    <main>
      <img src="/logo.svg" alt="" width={56} height={56} />
      {user ? (
        <>
          <h1>You are signed in</h1>
          <p>{user.email}</p>
          <a className="btn secondary" href="/logout">Sign out</a>
        </>
      ) : (
        <>
          <h1>Sign in to AI Hub</h1>
          <p>{desktop ? 'Continue with Google, then you will be sent back to the desktop app.' : 'Use your Google account.'}</p>
          <a className="btn" href={`/auth/google${desktop ? `?${new URLSearchParams({ port, challenge })}` : ''}`}>
            <svg viewBox="0 0 48 48" width="18" height="18" aria-hidden="true">
              <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
              <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
              <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
              <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
            </svg>
            Continue with Google
          </a>
        </>
      )}
    </main>
  )
}
