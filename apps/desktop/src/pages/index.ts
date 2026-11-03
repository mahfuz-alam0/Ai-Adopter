import type { ComponentType } from 'react'
import { ConnectionsPage } from './ConnectionsPage.tsx'
import { GooglePage } from './GooglePage.tsx'
import { HubPage } from './HubPage.tsx'
import { RemotePage } from './RemotePage.tsx'

// Add a page here and it gets a route and a sidebar link. Pages without a nav entry (WelcomePage) are routed in App.tsx.
export const PAGES = [
  { path: '/', label: 'Hub', icon: 'M3 11l9-7 9 7M5 9.5V20h14V9.5', Page: HubPage },
  { path: '/connections', label: 'Connections', icon: 'M9 2v5M15 2v5M6 7h12v4a6 6 0 0 1-12 0zM12 17v5', Page: ConnectionsPage },
  { path: '/google', label: 'Google', icon: 'M21 2l-2 2m-7.6 7.6a5.5 5.5 0 1 1-7.8 7.8 5.5 5.5 0 0 1 7.8-7.8zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4', Page: GooglePage },
  { path: '/remote', label: 'Remote', icon: 'M2 9a14.5 14.5 0 0 1 20 0M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0M12 19.5h.01', Page: RemotePage },
] as const satisfies readonly { path: string; label: string; icon: string; Page: ComponentType }[]
