import { AUTH_URL, token } from './auth.ts'

export interface Job { id: string; prompt: string; mode: 'parallel' | 'cross'; models?: string[] }
export type Link = 'online' | 'working' | 'retry'
export class SignedOut extends Error {}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

const call = (path: string, body: object, signal?: AbortSignal) =>
  fetch(`${AUTH_URL}${path}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token()}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  })

export async function newKey(): Promise<string> {
  const r = await call('/remote/key', {})
  if (r.status === 401) throw new SignedOut()
  if (!r.ok) throw new Error(`Could not create a key (${r.status})`)
  return ((await r.json()) as { key: string }).key
}

// Outbound only: the app asks the server for work, so no port is opened on this machine.
// Jobs run one at a time; the server holds each poll ~20s. Resolves when aborted, rejects with SignedOut on 401.
export async function serve(
  models: () => { id: string; name: string }[],
  run: (job: Job) => Promise<object>,
  onLink: (l: Link) => void,
  signal: AbortSignal,
) {
  while (!signal.aborted) {
    try {
      const r = await call('/remote/poll', { models: models() }, signal)
      if (r.status === 401) throw new SignedOut()
      if (!r.ok) throw new Error(`server ${r.status}`)
      onLink('online')
      const { job } = (await r.json()) as { job: Job | null }
      if (!job) continue
      onLink('working')
      const out = await run(job).catch((e) => ({ error: String(e) }))
      // Not tied to `signal`: turning Remote off mid-job still delivers the answer.
      await call('/remote/result', { id: job.id, ...out })
      onLink('online')
    } catch (e) {
      if (signal.aborted) return
      if (e instanceof SignedOut) throw e
      onLink('retry')
      await sleep(5_000)
    }
  }
}
