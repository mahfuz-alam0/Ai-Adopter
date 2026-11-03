import { Button } from '../components/Button.tsx'
import { useHub } from '../state/HubContext.tsx'
import type { RemoteState } from '../state/useRemote.ts'

const LABEL: Record<RemoteState, string> = {
  off: 'Off',
  'signed-out': 'Sign in again to serve requests',
  online: 'Waiting for requests',
  working: 'Answering a request',
  retry: 'Server unreachable, retrying',
}

// Remote mode: other devices and scripts use the connected AIs through the server's API.
export function RemotePage() {
  const { account, remote, providers } = useHub()
  const { state, toggle, key, makeKey, endpoint } = remote
  const curl = `curl ${endpoint}/v1/ask \\\n  -H "Authorization: Bearer ${key || '<key>'}" \\\n  -d '{"prompt":"Hello","mode":"parallel"}'`

  return (
    <div className="min-h-0 flex-1 overflow-auto px-7 pt-7 pb-6">
      <div className="mx-auto max-w-[760px]">
        <h1 className="text-xl font-bold tracking-tight">Remote</h1>
        <p className="mt-0.5 mb-5 text-muted">
          Use your connected AIs from another device or script. Requests go through the server and run here, in this app, so keep it open.
        </p>

        {!account.user ? (
          <section className="rounded-xl border border-line bg-panel p-4">
            <b className="block text-[15px]">Sign in first</b>
            <p className="mt-0.5 mb-3 text-muted">Remote ties requests to your account.</p>
            <Button variant="primary" disabled={account.busy} onClick={() => void account.toggle()}>
              Sign in with Google
            </Button>
          </section>
        ) : (
          <>
            <section className="flex items-center gap-3 rounded-xl border border-line bg-panel p-4">
              <div>
                <b className="block text-[15px]">Remote access</b>
                <span className="text-xs text-muted" role="status">{LABEL[state]}</span>
              </div>
              <Button className="ml-auto" variant={state === 'off' ? 'primary' : 'default'} onClick={toggle}>
                {state === 'off' ? 'Turn on' : 'Turn off'}
              </Button>
            </section>

            <section className="mt-4 rounded-xl border border-line bg-panel p-4">
              <b className="block text-[15px]">API key</b>
              <p className="mt-0.5 mb-3 text-muted">
                Anyone with the key can ask {providers.length ? 'your connected AIs' : 'your AIs'} while Remote is on. A new key replaces the old one.
              </p>
              {key && <input readOnly value={key} aria-label="API key" className="mb-3 block w-full rounded-lg border border-line bg-panel2 px-2.5 py-1.5 font-mono text-[13px] select-text" onFocus={(e) => e.currentTarget.select()} />}
              <Button onClick={() => void makeKey()}>{key ? 'Replace key' : 'Create key'}</Button>
            </section>

            <section className="mt-4 rounded-xl border border-line bg-panel p-4">
              <b className="block text-[15px]">Use it</b>
              <p className="mt-0.5 mb-3 text-muted">
                <code>GET /v1/models</code> lists the AIs. <code>POST /v1/ask</code> takes <code>prompt</code>, optional <code>mode</code> (parallel or cross) and <code>models</code> (ids), and replies with <code>answers</code>, <code>errors</code> and <code>matrix</code>.
              </p>
              <pre className="overflow-x-auto rounded-lg border border-line bg-panel2 p-3 font-mono text-xs/5 select-text">{curl}</pre>
            </section>
          </>
        )}
      </div>
    </div>
  )
}
