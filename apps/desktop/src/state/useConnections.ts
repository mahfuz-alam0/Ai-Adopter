import { useCallback, useEffect, useState } from 'react'
import { LaneManager, canSend } from '../lib/lanes.ts'
import type { Shown, State } from '../lib/lanes.ts'
import { loadProviders, saveProviders } from '../lib/providers.ts'
import type { Provider } from '../lib/providers.ts'

// One manager for the whole app: it owns the hidden provider webviews.
export const lanes = new LaneManager({})
// A hot update re-runs this module and makes an empty manager while React keeps its state, so register() never
// runs again and lanes lose their URLs. Reload the page instead.
import.meta.hot?.accept(() => location.reload())

const LOGINS = 'logins'
const GOOGLE = 'google'
lanes.google = localStorage.getItem(GOOGLE) === '1'
const register = (p: Provider) => {
  lanes.ok[p.id] = JSON.parse(localStorage.getItem(LOGINS) ?? '{}')[p.id]
  lanes.urls[p.id] = p.url
  lanes.sels[p.id] = p.sel
  lanes.names[p.id] = p.name
}

// The added providers and the live state of each lane.
export function useConnections(setStatus: (t: string) => void) {
  const [providers, setProviders] = useState<Provider[]>(() => {
    const all = loadProviders()
    all.forEach(register)
    return all
  })
  const [states, setStates] = useState<Record<string, State>>({})
  const [shown, setShown] = useState<Shown | null>(null)

  // LaneManager is not reactive, so read it on a timer and only re-render when something changed.
  const sync = useCallback(() => {
    const next = Object.fromEntries(providers.map((p) => [p.id, lanes.state(p.id)]))
    localStorage.setItem(LOGINS, JSON.stringify(lanes.ok)) // last known login result survives a restart
    setStates((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next))
    setShown((prev) => (prev?.id === lanes.shown?.id ? prev : lanes.shown))
  }, [providers])
  useEffect(() => {
    lanes.onDone = (id, ok) => {
      setStatus(ok ? '' : `${lanes.names[id]} is not logged in. Click Log in and sign in with email, a code or Continue with Google.`)
      sync()
    }
  }, [setStatus, sync])
  // Load the logged-in AIs' pages now, so the first prompt does not wait for them.
  useEffect(() => {
    lanes.warm(providers.map((p) => p.id))
  }, []) // once, at startup
  useEffect(() => {
    sync()
    const t = setInterval(sync, 500)
    return () => clearInterval(t)
  }, [sync])

  // Shared Google session: sign in once, then "Continue with Google" works on every AI site.
  const [google, setGoogle] = useState(lanes.google)
  const [googleBusy, setGoogleBusy] = useState(false)
  const toggleGoogle = async () => {
    setGoogleBusy(true)
    try {
      // The session itself is the google.com cookies in the google lane's store on disk; the flag only remembers it.
      const on = lanes.google ? await lanes.googleOut().then(() => false) : await lanes.googleLogin()
      localStorage.setItem(GOOGLE, on ? '1' : '0')
      setGoogle(on)
    } finally {
      setGoogleBusy(false)
    }
  }

  const stateOf = (id: string): State => states[id] ?? lanes.state(id)
  // At least one AI can take a prompt right now.
  const ready = providers.some((p) => canSend(stateOf(p.id)))

  // Open shows the site inside the app so the user can log in or browse. Done checks the page for a login, then
  // closes it; the session stays in the lane's cookie store.
  const toggle = async (p: Provider) => {
    await (lanes.state(p.id) === 'needs-user' ? lanes.finish(p.id) : lanes.login(p.id)).catch((e) => setStatus(String(e)))
    sync()
  }

  const connect = async (p: Provider) => {
    register(p)
    const next = [...providers, p]
    saveProviders(next)
    setProviders(next)
    // Always show the login page. Sites like Gemini and ChatGPT give guests a prompt box with a tight limit,
    // and a hidden check cannot reliably tell a guest from a login.
    setStatus(`Log in to ${p.name} in the box that opens, then click Done. ${LOGIN_HINT}`)
    await lanes.login(p.id).catch((e) => setStatus(String(e)))
    sync()
  }

  const remove = async (p: Provider) => {
    await lanes.close(p.id).catch(() => undefined)
    delete lanes.ok[p.id]
    const next = providers.filter((x) => x.id !== p.id)
    saveProviders(next)
    setProviders(next)
  }

  return { providers, stateOf, ready, toggle, connect, remove, sync, shown, place: lanes.place.bind(lanes), unplace: lanes.unplace.bind(lanes), google, googleBusy, toggleGoogle: () => toggleGoogle().catch((e) => setStatus(String(e))) }
}

export const LOGIN_HINT = 'Use email or a code, or sign in on the Google page first and pick Continue with Google.'
