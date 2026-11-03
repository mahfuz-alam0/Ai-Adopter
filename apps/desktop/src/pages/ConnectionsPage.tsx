import { Button } from '../components/Button.tsx'
import { ConnectionTile } from '../components/ConnectionTile.tsx'
import { useHub } from '../state/HubContext.tsx'

// Manage the apps: open a login window, hide it again, or remove an app.
export function ConnectionsPage() {
  const { providers, stateOf, toggle, remove, setConnectOpen, google, toggleGoogle } = useHub()
  return (
    <div className="min-h-0 flex-1 overflow-auto px-7 pt-7 pb-6">
      <div className="mx-auto mb-5 flex max-w-[1200px] items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Connections</h1>
          <p className="mt-0.5 text-muted">Log in once. Each app keeps its session and runs in the background.</p>
        </div>
        <Button variant="primary" onClick={() => setConnectOpen(true)}>
          Connect an AI
        </Button>
      </div>
      <div className="mx-auto mb-4 flex max-w-[1200px] items-center justify-between gap-4 rounded-xl border border-line bg-panel p-4">
        <div>
          <h3 className="text-[15px] font-semibold">Google account</h3>
          <p className="mt-0.5 text-xs text-muted">
            {google ? 'Signed in. Pick Continue with Google on any AI site.' : 'Sign in once, then use Continue with Google on every AI site.'}
          </p>
        </div>
        <Button variant={google ? 'ghost' : 'primary'} onClick={() => void toggleGoogle()}>
          {google ? 'Sign out' : 'Sign in with Google'}
        </Button>
      </div>
      {providers.length ? (
        <div className="mx-auto grid max-w-[1200px] grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-4">
          {providers.map((p) => (
            <ConnectionTile key={p.id} p={p} state={stateOf(p.id)} onToggle={() => void toggle(p)} onRemove={() => void remove(p)} />
          ))}
        </div>
      ) : (
        <p className="mx-auto my-16 max-w-[420px] text-center text-muted">
          <b className="mb-1 block text-base text-fg">No apps yet</b>
          Connect Claude, ChatGPT, Gemini or any chat site, log in once, then ask them all from the Hub.
        </p>
      )}
    </div>
  )
}
