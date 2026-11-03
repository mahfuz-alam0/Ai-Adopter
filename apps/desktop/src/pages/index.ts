import type { ComponentType } from 'react'
import { ConnectionsPage } from './ConnectionsPage.tsx'
import { HubPage } from './HubPage.tsx'
import { RemotePage } from './RemotePage.tsx'

// Add a page here and it gets a route and a sidebar link. Pages without a nav entry (WelcomePage) are routed in App.tsx.
export const PAGES = [
  { path: '/', label: 'Hub', Page: HubPage },
  { path: '/connections', label: 'Connections', Page: ConnectionsPage },
  { path: '/remote', label: 'Remote', Page: RemotePage },
] as const satisfies readonly { path: string; label: string; Page: ComponentType }[]
