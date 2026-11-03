import { Navigate } from 'react-router'
import { Button } from '../components/Button.tsx'
import { Mark, tint } from '../components/Mark.tsx'
import { StateLabel } from '../components/StateLabel.tsx'
import { PRESETS } from '../lib/providers.ts'
import { useHub } from '../state/HubContext.tsx'

// The Hub while no AI can answer: connect one, or finish logging in to the ones already added.
export function WelcomePage() {
  const { providers, stateOf, ready, toggle, connect, remove, setConnectOpen } = useHub()
  if (ready) return <Navigate to="/" replace />

  return (
    <div className="grid min-h-0 flex-1 place-items-center overflow-auto p-8">
      <section className="w-[min(520px,100%)] text-center">
        {providers.length ? (
          <>
            <h1 className="text-xl font-bold tracking-tight">Log in to an AI to start</h1>
            <p className="mt-1 mb-5 text-muted">None of your AIs is logged in. Log in with email or a code: Google sign-in does not work inside app windows.</p>
            <ul className="m-0 mb-4 flex list-none flex-col gap-2 p-0">
              {providers.map((p) => {
                const s = stateOf(p.id)
                return (
                  <li key={p.id} data-state={s} style={tint(p.color)} className="group flex items-center gap-3 rounded-xl border border-line bg-panel px-3.5 py-2.5 text-left">
                    <Mark p={p} />
                    <div className="min-w-0 flex-1 leading-[1.3]">
                      <b className="block truncate font-semibold">{p.name}</b>
                      <StateLabel state={s} />
                    </div>
                    <Button variant="primary" disabled={s === 'checking'} onClick={() => void toggle(p)}>
                      {s === 'needs-user' ? 'Done' : 'Log in'}
                    </Button>
                    <Button variant="ghost" onClick={() => void remove(p)}>
                      Remove
                    </Button>
                  </li>
                )
              })}
            </ul>
          </>
        ) : (
          <>
            <h1 className="text-xl font-bold tracking-tight">Connect an AI to start</h1>
            <p className="mt-1 mb-5 text-muted">Log in to an AI once. Then everything you type here reaches it, and any others you add.</p>
            <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {PRESETS.map((p) => (
                <Button key={p.id} size="lg" style={tint(p.color)} className="flex items-center justify-center gap-2" onClick={() => void connect(p)}>
                  <span className="size-2.5 rounded-full bg-(--c)" />
                  {p.name}
                </Button>
              ))}
            </div>
          </>
        )}
        <Button variant="ghost" onClick={() => setConnectOpen(true)}>
          {providers.length ? 'Connect another AI' : 'Other site…'}
        </Button>
      </section>
    </div>
  )
}
