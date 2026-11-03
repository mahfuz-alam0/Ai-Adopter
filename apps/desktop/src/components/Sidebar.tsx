import { useRef, useState } from 'react'
import { NavLink, useNavigate } from 'react-router'
import type { State } from '../lib/lanes.ts'
import type { Provider } from '../lib/providers.ts'
import { PAGES } from '../pages/index.ts'
import { useHub } from '../state/HubContext.tsx'
import { Button, buttonClass } from './Button.tsx'
import { Mark, tint } from './Mark.tsx'
import { StateLabel } from './StateLabel.tsx'

// What toggle() does for a lane in this state: check an open login window, or open one.
const action = (s: State) => (s === 'needs-user' ? 'Done' : s === 'logged-out' || s === 'unknown' ? 'Log in' : 'Reconnect')

export function Sidebar() {
  const { providers, stateOf, ready, toggle, remove, reset, setConnectOpen, account, remote } = useHub()
  const navigate = useNavigate()
  const waiting = providers.filter((p) => stateOf(p.id) === 'needs-user').length
  const menu = useRef<HTMLDivElement>(null)
  const [menuFor, setMenuFor] = useState<Provider>()

  // One shared menu for every AI, opened at the pointer. The popover API closes it on Escape or an outside click.
  const openMenu = (p: Provider, x: number, y: number) => {
    const m = menu.current!
    setMenuFor(p)
    m.togglePopover(true)
    m.style.left = `${x}px`
    m.style.top = `${Math.min(y, innerHeight - m.offsetHeight - 8)}px`
  }
  const pick = (f: (p: Provider) => unknown) => () => {
    menu.current!.hidePopover()
    if (menuFor) void f(menuFor)
  }

  return (
    <aside className="flex min-h-0 flex-col border-r border-line bg-side px-3 pt-4.5 pb-3">
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
              <span className="min-w-4.5 rounded-full bg-warn px-1.5 text-center text-[11px]/[18px] font-normal text-on" title="A window is waiting for you">
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
            <li
              key={p.id}
              data-state={s}
              style={tint(p.color)}
              title={new URL(p.url).host}
              className="group flex items-center gap-2.5 rounded-[9px] px-2 py-1.5 hover:bg-hover"
              onContextMenu={(e) => {
                e.preventDefault()
                openMenu(p, e.clientX, e.clientY)
              }}
            >
              <Mark p={p} />
              <div className="min-w-0 flex-1 leading-[1.3]">
                <b className="block truncate font-semibold">{p.name}</b>
                <StateLabel state={s} />
              </div>
              {action(s) !== 'Reconnect' && (
                <Button variant="primary" size="sm" onClick={() => void toggle(p)}>
                  {action(s)}
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                title={`${p.name} options`}
                aria-label={`${p.name} options`}
                className="flex-none opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                onClick={(e) => {
                  const r = e.currentTarget.getBoundingClientRect()
                  openMenu(p, r.left, r.bottom + 4)
                }}
              >
                ⋯
              </Button>
            </li>
          )
        })}
      </ul>

      <div ref={menu} popover="auto" className="fixed inset-auto m-0 min-w-36 rounded-lg border border-line2 bg-panel p-1 text-fg shadow-lift">
        <Button variant="ghost" className="w-full text-left" onClick={pick(toggle)}>
          {menuFor ? action(stateOf(menuFor.id)) : 'Reconnect'}
        </Button>
        <Button variant="ghost" className="w-full text-left text-bad!" onClick={pick(remove)}>
          Remove
        </Button>
      </div>

      <Button variant="ghost" className="mt-2 w-full truncate text-left" disabled={account.busy} onClick={() => void account.toggle()}>
        {account.user ? `Sign out · ${account.user.email}` : 'Sign in with Google'}
      </Button>
    </aside>
  )
}
