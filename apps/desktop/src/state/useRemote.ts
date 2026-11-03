import { useEffect, useRef, useState } from 'react'
import { AUTH_URL } from '../lib/auth.ts'
import { SignedOut, newKey, serve } from '../lib/remote.ts'
import type { Link } from '../lib/remote.ts'
import type { useAccount } from './useAccount.ts'
import type { useConnections } from './useConnections.ts'
import type { useThread } from './useThread.ts'

export type RemoteState = 'off' | 'signed-out' | Link
const KEY = 'remote'
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// Remote mode: other devices call the server's /v1 API, the server relays each request here, and this app
// runs it through the same lanes as a typed prompt.
export function useRemote(
  conn: ReturnType<typeof useConnections>,
  thread: ReturnType<typeof useThread>,
  account: ReturnType<typeof useAccount>,
  setStatus: (t: string) => void,
) {
  const [on, setOn] = useState(() => localStorage.getItem(KEY) === '1')
  const [link, setLink] = useState<Link>('online')
  const [expired, setExpired] = useState(false)
  const [key, setKey] = useState('')
  // The poll loop outlives renders, so it reads providers and the thread through a ref.
  const latest = useRef({ conn, thread })
  latest.current = { conn, thread }
  const signedIn = !!account.user

  useEffect(() => {
    if (!on || !signedIn) return
    const ctl = new AbortController()
    setExpired(false)
    setLink('online')
    serve(
      () => latest.current.conn.providers.map(({ id, name }) => ({ id, name })),
      async (job) => {
        while (latest.current.thread.running) await sleep(500) // a typed prompt is in flight
        return latest.current.thread.submit(job.prompt, { mode: job.mode, only: job.models, via: 'a remote request' })
      },
      setLink,
      ctl.signal,
    ).catch((e) => e instanceof SignedOut && setExpired(true))
    return () => ctl.abort()
  }, [on, signedIn])

  const state: RemoteState = !on ? 'off' : !signedIn || expired ? 'signed-out' : link

  const toggle = () => {
    localStorage.setItem(KEY, on ? '0' : '1')
    setOn(!on)
  }
  const makeKey = () => newKey().then(setKey, (e) => setStatus(e instanceof SignedOut ? 'Session expired. Sign out and sign in again.' : String(e)))

  return { state, toggle, key, makeKey, endpoint: AUTH_URL }
}
