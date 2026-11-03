import { Button } from '../components/Button.tsx'
import { useHub } from '../state/HubContext.tsx'

// The shared Google session: sign in once here, every AI site then opens with it ("Continue with Google").
export function GooglePage() {
  const { google, googleBusy, toggleGoogle } = useHub()
  return (
    <div className="min-h-0 flex-1 overflow-auto px-7 pt-7 pb-6">
      <div className="mx-auto max-w-[760px]">
        <h1 className="text-xl font-bold tracking-tight">Google account</h1>
        <p className="mt-0.5 mb-5 text-muted">Sign in once. Every connected AI site gets the same Google session, so Continue with Google just works.</p>
        <section className="flex items-center gap-3 rounded-xl border border-line bg-panel p-4">
          <div>
            <b className="block text-[15px]">{google ? 'Signed in' : 'Not signed in'}</b>
            <span className="text-xs text-muted" role="status">
              {google ? 'Shared with every AI site you open or connect.' : 'The sign-in opens here in the app.'}
            </span>
          </div>
          <Button className="ml-auto" variant={google ? 'default' : 'primary'} disabled={googleBusy} onClick={() => void toggleGoogle()}>
            {google ? 'Sign out' : 'Sign in with Google'}
          </Button>
        </section>
        {google && (
          <p className="mt-3 text-xs text-muted">
            Signing out removes the shared session. An AI site that already signed in with Google keeps its own login until you log out of it.
          </p>
        )}
      </div>
    </div>
  )
}
