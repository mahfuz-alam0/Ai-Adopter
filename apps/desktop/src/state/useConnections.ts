import { useCallback, useEffect, useState } from 'react'
import { LaneManager, canSend } from '../lib/lanes.ts'
import type { State } from '../lib/lanes.ts'
import { loadProviders, saveProviders } from '../lib/providers.ts'
import type { Provider } from '../lib/providers.ts'

// One manager for the whole app: it owns the hidden provider webviews.
export const lanes = new LaneManager({})

const LOGINS = 'logins'
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

  // LaneManager is not reactive, so read it on a timer and only re-render when something changed.
  const sync = useCallback(() => {
    const next = Object.fromEntries(providers.map((p) => [p.id, lanes.state(p.id)]))
    localStorage.setItem(LOGINS, JSON.stringify(lanes.ok)) // last known login result survives a restart
    setStates((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next))
  }, [providers])
  useEffect(() => {
    lanes.onDone = (id, ok) => {
      setStatus(ok ? '' : `${lanes.names[id]} is not logged in. Click Log in and sign in with email or a code.`)
      sync()
    }
  }, [setStatus, sync])
  useEffect(() => {
    sync()
    const t = setInterval(sync, 500)
    return () => clearInterval(t)
  }, [sync])

  const stateOf = (id: string): State => states[id] ?? lanes.state(id)
  // At least one AI can take a prompt right now.
  const ready = providers.some((p) => canSend(stateOf(p.id)))

  // Open shows the site's window so the user can log in or browse. Done checks the page for a login, then closes
  // the window; the session stays in the lane's cookie store.
  const toggle = async (p: Provider) => {
    await (lanes.state(p.id) === 'needs-user' ? lanes.finish(p.id) : lanes.login(p.id)).catch((e) => setStatus(String(e)))
    sync()
  }

  const connect = async (p: Provider) => {
    register(p)
    const next = [...providers, p]
    saveProviders(next)
    setProviders(next)
    setStatus(`Log in to ${p.name} in the window that opens, then click Done next to it in the sidebar. ${LOGIN_HINT}`)
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

  return { providers, stateOf, ready, toggle, connect, remove, sync }
}

// Google refuses its sign-in inside embedded webviews, so provider logins must use email or code.
export const LOGIN_HINT = 'Use email or a code: Google sign-in does not work inside app windows.'
