import { createContext, useContext, useState } from 'react'
import type { ReactNode } from 'react'
import { useAccount } from './useAccount.ts'
import { useConnections } from './useConnections.ts'
import { useRemote } from './useRemote.ts'
import { useThread } from './useThread.ts'

// Everything the UI reads or triggers, in one place. Components never touch lanes directly.
function useHubState() {
  const [status, setStatus] = useState('')
  const [connectOpen, setConnectOpen] = useState(false)
  const connections = useConnections(setStatus)
  const thread = useThread(connections, setStatus)
  const account = useAccount(setStatus)
  const remote = useRemote(connections, thread, account, setStatus)
  return { status, connectOpen, setConnectOpen, account, remote, ...connections, ...thread }
}

const HubCtx = createContext<ReturnType<typeof useHubState> | null>(null)

export function HubProvider({ children }: { children: ReactNode }) {
  return <HubCtx.Provider value={useHubState()}>{children}</HubCtx.Provider>
}

export function useHub() {
  const hub = useContext(HubCtx)
  if (!hub) throw new Error('useHub needs a HubProvider')
  return hub
}
