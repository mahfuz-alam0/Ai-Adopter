import { useEffect, useRef } from 'react'
import type { FormEvent, InputHTMLAttributes } from 'react'
import { PRESETS, customId } from '../lib/providers.ts'
import type { Provider, Selectors } from '../lib/providers.ts'
import { useHub } from '../state/HubContext.tsx'
import { Button, focusRing } from './Button.tsx'
import { Mark, tint } from './Mark.tsx'

const Field = ({ label, ...rest }: { label: string } & InputHTMLAttributes<HTMLInputElement>) => (
  <label className="mt-2.5 block text-xs text-muted">
    {label}
    <input {...rest} className={`mt-0.5 block w-full rounded-lg border border-line bg-panel2 px-2.5 py-1.5 text-[13px] text-fg select-text ${focusRing}`} />
  </label>
)

export function ConnectDialog() {
  const { providers, connect, connectOpen, setConnectOpen } = useHub()
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const d = ref.current!
    if (connectOpen && !d.open) d.showModal()
    if (!connectOpen && d.open) d.close()
  }, [connectOpen])

  const pick = (p: Provider) => {
    setConnectOpen(false)
    void connect(p)
  }

  const onCustom = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const f = e.currentTarget
    const d = new FormData(f)
    const sel: Selectors = {}
    for (const k of ['input', 'send', 'stop', 'reply'] as const) {
      const v = String(d.get(k)).trim()
      if (v) sel[k] = v
    }
    const color = `hsl(${Math.floor(Math.random() * 360)} 60% 55%)`
    pick({ id: customId(), name: String(d.get('name')).trim(), url: String(d.get('url')), color, sel })
    f.reset()
  }

  return (
    <dialog
      ref={ref}
      onClose={() => setConnectOpen(false)}
      className="m-auto max-h-[90vh] w-[min(460px,90vw)] overflow-auto rounded-2xl border border-line2 bg-panel p-[22px] text-fg shadow-lift open:animate-rise backdrop:bg-black/50 backdrop:backdrop-blur-md motion-reduce:animate-none"
    >
      <h3 className="text-base font-bold">Connect an AI</h3>
      <p className="mb-4 text-muted">Pick one, then log in once in the panel that opens.</p>
      <div className="mb-3 grid grid-cols-3 gap-2 empty:after:col-span-full empty:after:text-muted empty:after:content-['Every_built-in_AI_is_already_connected.']">
        {PRESETS.filter((p) => !providers.some((x) => x.id === p.id)).map((p) => (
          <Button key={p.id} size="lg" style={tint(p.color)} className="group flex flex-col items-center gap-2 py-3.5 text-[13px] enabled:hover:border-(--c)/60" onClick={() => pick(p)}>
            <Mark p={p} size="lg" className="transition-transform group-hover:scale-110 motion-reduce:transition-none" />
            {p.name}
          </Button>
        ))}
      </div>
      <details className="group/c">
        <summary className="flex list-none items-center gap-1.5 py-1 text-muted hover:text-fg [&::-webkit-details-marker]:hidden">
          <span aria-hidden="true" className="inline-block transition-transform group-open/c:rotate-90 motion-reduce:transition-none">
            ›
          </span>
          Custom site
        </summary>
        <form onSubmit={onCustom}>
          <Field label="Name" name="name" required />
          <Field label="URL" name="url" type="url" pattern="https?://.+" placeholder="https://…" required />
          <p className="mt-2.5 text-xs text-muted">Selectors are optional. Blank fields are auto-detected, which may fail on some sites.</p>
          <Field label="Prompt box" name="input" />
          <Field label="Send button" name="send" />
          <Field label="Stop button" name="stop" />
          <Field label="Reply" name="reply" />
          <Button type="submit" variant="primary" className="mt-3.5">
            Connect and log in
          </Button>
        </form>
      </details>
      <div className="mt-4 flex justify-end">
        <Button onClick={() => setConnectOpen(false)}>Cancel</Button>
      </div>
    </dialog>
  )
}
