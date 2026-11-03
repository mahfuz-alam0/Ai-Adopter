import { NavLink, useNavigate } from 'react-router'
import { PAGES } from '../pages/index.ts'
import { useHub } from '../state/HubContext.tsx'
import { Button, buttonClass } from './Button.tsx'
import { Mark, tint } from './Mark.tsx'
import { StateLabel } from './StateLabel.tsx'

export function Sidebar() {
  const { providers, stateOf, ready, toggle, reset, setConnectOpen, account, remote } = useHub()
  const navigate = useNavigate()
  const waiting = providers.filter((p) => stateOf(p.id) === 'needs-user').length

  return (
    <aside className="flex min-h-0 flex-col border-r border-line bg-side px-3 pt-[18px] pb-3">
      <div className="flex items-center gap-2.5 px-2 pb-4 text-[15px] font-semibold tracking-tight">
        <img src="/logo.svg" alt="" className="size-7" />
        AI Hub
      </div>

      <nav aria-label="Pages" className="mb-3 flex flex-col gap-0.5">
        {PAGES.map((p) => (
          <NavLink
            key={p.path}
            // With no AI ready the Hub is the Welcome page.
            to={p.path === '/' && !ready ? '/welcome' : p.path}
            className={buttonClass('ghost', 'md', 'flex items-center justify-between text-left aria-[current=page]:bg-hover aria-[current=page]:font-semibold aria-[current=page]:text-fg')}
          >
            {p.label}
            {p.path === '/remote' && (remote.state === 'online' || remote.state === 'working') && (
              <span className="size-2 rounded-full bg-good" title="Remote is on" />
            )}
            {p.path === '/connections' && waiting > 0 && (
              <span className="min-w-[18px] rounded-full bg-warn px-1.5 text-center text-[11px]/[18px] font-normal text-on" title="A window is waiting for you">
                {waiting}
              </span>
            )}
          </NavLink>
        ))}
      </nav>

      <Button
        variant="outline"
        className="w-full text-left"
        onClick={() => {
          void navigate('/')
          void reset()
        }}
      >
        New thread
      </Button>

      <div className="flex items-center justify-between px-2 pt-5 pb-1.5 text-xs font-medium text-dim">
        <span>Connected AIs</span>
        <Button variant="ghost" size="icon" title="Connect an AI" aria-label="Connect an AI" onClick={() => setConnectOpen(true)}>
          +
        </Button>
      </div>
      <ul className="m-0 min-h-0 flex-1 list-none overflow-auto p-0">
        {providers.map((p) => {
          const s = stateOf(p.id)
          return (
            <li key={p.id} data-state={s} style={tint(p.color)} title={new URL(p.url).host} className="group flex items-center gap-2.5 rounded-[9px] px-2 py-1.5 hover:bg-hover">
              <Mark p={p} />
              <div className="min-w-0 flex-1 leading-[1.3]">
                <b className="block truncate font-semibold">{p.name}</b>
                <StateLabel state={s} />
              </div>
              {s === 'needs-user' && (
                <Button variant="primary" size="sm" onClick={() => void toggle(p)}>
                  Done
                </Button>
              )}
            </li>
          )
        })}
      </ul>

      <Button variant="ghost" className="mt-2 w-full truncate text-left" disabled={account.busy} onClick={() => void account.toggle()}>
        {account.user ? `Sign out · ${account.user.email}` : 'Sign in with Google'}
      </Button>
    </aside>
  )
}
