import { useRef, useState } from 'react'
import { NavLink, useNavigate } from 'react-router'
import type { State } from '../lib/lanes.ts'
import type { Provider } from '../lib/providers.ts'
import { PAGES } from '../pages/index.ts'
import { useHub } from '../state/HubContext.tsx'
import { Button, buttonClass, focusRing } from './Button.tsx'
import { Mark, tint } from './Mark.tsx'
import { STATE_DOT, STATE_LABEL } from './StateLabel.tsx'

// What toggle() does for a lane in this state: check an open login window, or open one.
const action = (s: State) => (s === 'needs-user' ? 'Done' : s === 'logged-out' || s === 'unknown' ? 'Log in' : 'Reconnect')

const PANEL = 'M3 5h18v14H3zM9 5v14'
const PLUS = 'M12 5v14M5 12h14'
const USER = 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0'

// Line icon on a 24 grid; d may hold several subpaths.
const Icon = ({ d }: { d: string }) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4 flex-none fill-none stroke-current stroke-2 [stroke-linecap:round] [stroke-linejoin:round]">
    <path d={d} />
  </svg>
)

// Logo with a status dot; a ring spins round it while the AI works. The opaque backing hides the ring behind the tinted mark.
const Avatar = ({ p, s }: { p: Provider; s: State }) => (
  <span className="relative flex-none">
    {(s === 'busy' || s === 'checking') && (
      <span className="absolute -inset-0.5 overflow-hidden rounded-[10px]" aria-hidden="true">
        <i className="absolute -inset-2 animate-spin [animation-duration:1.2s] [background:conic-gradient(from_0deg,transparent_45%,var(--c))] motion-reduce:animate-none" />
      </span>
    )}
    <span className="relative block rounded-lg bg-side group-hover:bg-hover">
      <Mark p={p} />
    </span>
    <i className={`absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full ring-2 ring-side group-hover:ring-hover motion-reduce:animate-none ${STATE_DOT[s]}`} />
  </span>
)

export function Sidebar() {
  const { providers, stateOf, ready, toggle, remove, reset, setConnectOpen, account, remote } = useHub()
  const navigate = useNavigate()
  const waiting = providers.filter((p) => stateOf(p.id) === 'needs-user').length
  const menu = useRef<HTMLDivElement>(null)
  const [menuFor, setMenuFor] = useState<Provider>()
  // Slim = icon rail. Remembered across launches.
  const [slim, setSlim] = useState(() => localStorage.sidebar === 'slim')
  const flip = () => {
    localStorage.sidebar = slim ? '' : 'slim'
    setSlim(!slim)
  }
  const accountLabel = account.user ? `Sign out · ${account.user.email}` : 'Sign in with Google'

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
    <aside
      className={`flex min-h-0 flex-col overflow-hidden border-r border-line bg-side pt-4.5 pb-3 transition-[width] duration-200 motion-reduce:transition-none ${slim ? 'w-15 px-2' : 'w-59 px-3'}`}
    >
      <div className={`flex items-center gap-2.5 pb-4 ${slim ? 'flex-col' : 'px-2'}`}>
        <img src="/logo.svg" alt="" className="size-7" />
        {!slim && <span className="flex-1 text-[15px] font-semibold tracking-tight">AI Hub</span>}
        <Button
          variant="ghost"
          size="icon"
          className="grid place-items-center"
          title={slim ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-label={slim ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-expanded={!slim}
          onClick={flip}
        >
          <Icon d={PANEL} />
        </Button>
      </div>

      <nav aria-label="Pages" className="mb-3 flex flex-col gap-0.5">
        {PAGES.map((p) => (
          <NavLink
            key={p.path}
            // With no AI ready the Hub is the Welcome page.
            to={p.path === '/' && !ready ? '/welcome' : p.path}
            title={slim ? p.label : undefined}
            aria-label={slim ? p.label : undefined}
            className={buttonClass('ghost', 'md', `relative flex items-center gap-2.5 text-left aria-[current=page]:bg-hover aria-[current=page]:font-semibold aria-[current=page]:text-fg ${slim ? 'justify-center' : ''}`)}
          >
            <Icon d={p.icon} />
            {!slim && <span className="flex-1">{p.label}</span>}
            {p.path === '/remote' && (remote.state === 'online' || remote.state === 'working') && (
              <span className={`size-2 rounded-full bg-good ${slim ? 'absolute top-1 right-1' : ''}`} title="Remote is on" />
            )}
            {p.path === '/connections' && waiting > 0 && (
              <span
                className={`min-w-4.5 rounded-full bg-warn px-1.5 text-center text-[11px]/[18px] font-normal text-on ${slim ? 'absolute -top-1 -right-1' : ''}`}
                title="A window is waiting for you"
              >
                {waiting}
              </span>
            )}
          </NavLink>
        ))}
      </nav>

      <Button
        variant="outline"
        className={`flex w-full items-center gap-2.5 ${slim ? 'justify-center' : 'text-left'}`}
        title={slim ? 'New thread' : undefined}
        aria-label="New thread"
        onClick={() => {
          void navigate('/')
          void reset()
        }}
      >
        <Icon d={PLUS} />
        {!slim && 'New thread'}
      </Button>

      <div className={`flex items-center pt-5 pb-1.5 text-xs font-medium text-dim ${slim ? 'justify-center' : 'justify-between px-2'}`}>
        {!slim && <span>Connected AIs</span>}
        <Button variant="ghost" size="icon" title="Connect an AI" aria-label="Connect an AI" onClick={() => setConnectOpen(true)}>
          +
        </Button>
      </div>
      <ul className="m-0 flex min-h-0 flex-1 list-none flex-col gap-0.5 overflow-auto p-0">
        {providers.map((p) => {
          const s = stateOf(p.id)
          return (
            <li
              key={p.id}
              data-state={s}
              style={tint(p.color)}
              title={slim ? `${p.name} · ${STATE_LABEL[s]}` : new URL(p.url).host}
              className={`group flex items-center gap-2.5 rounded-[9px] hover:bg-hover ${slim ? '' : 'px-2 py-1.5'}`}
              onContextMenu={(e) => {
                e.preventDefault()
                openMenu(p, e.clientX, e.clientY)
              }}
            >
              {slim ? (
                // The rail has no room for buttons: the logo opens the menu, which holds the same action.
                <button
                  type="button"
                  aria-label={`${p.name}: ${STATE_LABEL[s]}`}
                  className={`grid w-full cursor-default place-items-center rounded-[9px] py-1.5 ${focusRing}`}
                  onClick={(e) => {
                    const r = e.currentTarget.getBoundingClientRect()
                    openMenu(p, r.right + 6, r.top)
                  }}
                >
                  <Avatar p={p} s={s} />
                </button>
              ) : (
                <>
                  <Avatar p={p} s={s} />
                  <div className="min-w-0 flex-1 leading-[1.3]">
                    <b className="block truncate font-semibold">{p.name}</b>
                    <span className="block truncate text-[11.5px] text-muted group-data-[state=logged-out]:text-bad group-data-[state=needs-user]:text-warn">
                      {STATE_LABEL[s]}
                    </span>
                  </div>
                  {/* Button and ⋯ together leave no room for the name; the menu stays on right-click and Connections. */}
                  {action(s) !== 'Reconnect' ? (
                    <Button variant="primary" size="sm" className="flex-none" onClick={() => void toggle(p)}>
                      {action(s)}
                    </Button>
                  ) : (
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
                  )}
                </>
              )}
            </li>
          )
        })}
      </ul>

      <div ref={menu} popover="auto" className="fixed inset-auto m-0 min-w-36 rounded-lg border border-line2 bg-panel p-1 text-fg shadow-lift">
        <div className="truncate px-3 pt-1 pb-1.5 text-xs font-medium text-dim">{menuFor?.name}</div>
        <Button variant="ghost" className="w-full text-left" onClick={pick(toggle)}>
          {menuFor ? action(stateOf(menuFor.id)) : 'Reconnect'}
        </Button>
        <Button variant="ghost" className="w-full text-left text-bad!" onClick={pick(remove)}>
          Remove
        </Button>
      </div>

      <Button
        variant="ghost"
        className={`mt-2 flex w-full items-center gap-2.5 ${slim ? 'justify-center' : 'text-left'}`}
        title={slim ? accountLabel : undefined}
        aria-label={accountLabel}
        disabled={account.busy}
        onClick={() => void account.toggle()}
      >
        <Icon d={USER} />
        {!slim && <span className="min-w-0 truncate">{accountLabel}</span>}
      </Button>
    </aside>
  )
}
