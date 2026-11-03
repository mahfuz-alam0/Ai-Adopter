import { HashRouter, Navigate, Outlet, Route, Routes } from 'react-router'
import { ConnectDialog } from './components/ConnectDialog.tsx'
import { EmbedPane } from './components/EmbedPane.tsx'
import { Sidebar } from './components/Sidebar.tsx'
import { PAGES } from './pages/index.ts'
import { WelcomePage } from './pages/WelcomePage.tsx'
import { HubProvider, useHub } from './state/HubContext.tsx'

function Shell() {
  const { status } = useHub()
  return (
    <div className="grid h-screen grid-cols-[auto_1fr] [&_*::-webkit-scrollbar]:size-2.5 [&_*::-webkit-scrollbar-thumb]:rounded-full [&_*::-webkit-scrollbar-thumb]:border-[3px] [&_*::-webkit-scrollbar-thumb]:border-transparent [&_*::-webkit-scrollbar-thumb]:bg-line2 [&_*::-webkit-scrollbar-thumb]:bg-clip-content">
      <Sidebar />
      <main className="flex min-h-0 min-w-0 flex-col">
        <div className="border-b border-accent/30 bg-accent/12 px-7 py-2 text-[12.5px] empty:hidden" role="status">{status}</div>
        <div className="relative flex min-h-0 flex-1 flex-col">
          <Outlet />
          <EmbedPane />
        </div>
      </main>
      <ConnectDialog />
    </div>
  )
}

// HashRouter: the Tauri asset protocol has no server to fall back to index.html on a deep link.
export default function App() {
  return (
    <HubProvider>
      <HashRouter>
        <Routes>
          <Route element={<Shell />}>
            {PAGES.map(({ path, Page }) => (
              <Route key={path} path={path} element={<Page />} />
            ))}
            <Route path="/welcome" element={<WelcomePage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </HashRouter>
    </HubProvider>
  )
}
