import { LaneManager, NeedsUser, ask } from './lanes.ts'
import type { State } from './lanes.ts'
import { PRESETS, customId, loadProviders, saveProviders } from './providers.ts'
import type { Provider, Selectors } from './providers.ts'
import { parseVerdicts, reviewPrompt } from './cross.ts'
import type { Verdict } from './cross.ts'

const providers = loadProviders()
const lanes = new LaneManager({})
for (const p of providers) {
  lanes.urls[p.id] = p.url
  lanes.sels[p.id] = p.sel
}
const prov = (id: string) => providers.find((p) => p.id === id)!

let mode: 'parallel' | 'cross' = 'parallel'
let running = false
let turns: { q: string; a: string }[] = []

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T
const prompt = $<HTMLTextAreaElement>('prompt')
const form = $<HTMLFormElement>('form')
const send = $<HTMLButtonElement>('send')
const stage = $('stage')
const wires = document.querySelector<SVGSVGElement>('#wires')!
const cardsEl = $('cards')
const addEl = $('addbtn')
const dlg = $<HTMLDialogElement>('add')
const setStatus = (t: string) => ($('status').textContent = t)

// A card is a node on the hub: a wire runs from the prompt box to it.
interface Card {
  el: HTMLElement; wire: SVGPathElement; out: HTMLElement; rev: HTMLElement; state: HTMLElement; login: HTMLButtonElement
  tile: HTMLElement; pill: HTMLElement; open: HTMLButtonElement // the matching tile on the Apps page
}
const cards = new Map<string, Card>()

const makeWire = (cls = '') => {
  const w = document.createElementNS('http://www.w3.org/2000/svg', 'path')
  w.setAttribute('class', `wire ${cls}`)
  wires.append(w)
  return w
}
const addWire = makeWire('add')

function drawWires() {
  const s = stage.getBoundingClientRect()
  const f = form.getBoundingClientRect()
  const x1 = f.left + f.width / 2 - s.left
  const y1 = f.bottom - s.top
  for (const { el, wire } of [...cards.values(), { el: addEl, wire: addWire }]) {
    const c = el.getBoundingClientRect()
    const x2 = c.left + c.width / 2 - s.left
    const y2 = c.top - s.top
    const ym = (y1 + y2) / 2
    wire.setAttribute('d', `M${x1} ${y1}C${x1} ${ym} ${x2} ${ym} ${x2} ${y2}`)
  }
}

const LABEL: Record<State, string> = { cold: 'Connected', ready: 'Ready', busy: 'Working', 'needs-user': 'Window open' }
function refresh() {
  for (const [id, c] of cards) {
    const s = lanes.state(id)
    c.el.dataset.state = c.tile.dataset.state = s
    c.state.textContent = c.pill.textContent = LABEL[s]
    c.login.textContent = c.open.textContent = s === 'needs-user' ? 'Done' : 'Open'
    c.login.disabled = c.open.disabled = s === 'busy'
    c.wire.setAttribute('class', `wire ${s}`)
  }
  $('empty').hidden = cards.size > 0
  drawWires()
}
setInterval(refresh, 500)
new ResizeObserver(drawWires).observe(stage)

function addCard(p: Provider) {
  const el = document.createElement('section')
  el.className = 'card'
  el.style.setProperty('--c', p.color)
  el.innerHTML =
    '<header><h2></h2><span class="state"></span><button type="button" class="login"></button><button type="button" class="rm" title="Remove" aria-label="Remove">×</button></header><pre class="out"></pre><pre class="rev" hidden></pre>'
  el.querySelector('h2')!.textContent = p.name
  const tile = document.createElement('article')
  tile.className = 'tile'
  tile.style.setProperty('--c', p.color)
  tile.innerHTML =
    '<div class="logo" aria-hidden="true"></div><h3></h3><span class="host"></span><span class="pill"></span><div class="actions"><button type="button" class="open"></button><button type="button" class="rm">Remove</button></div>'
  tile.querySelector('.logo')!.textContent = p.name.slice(0, 1).toUpperCase()
  tile.querySelector('h3')!.textContent = p.name
  tile.querySelector('.host')!.textContent = new URL(p.url).host
  const q = <T extends HTMLElement>(root: HTMLElement, s: string) => root.querySelector(s) as T
  const card: Card = {
    el, wire: makeWire(), out: q(el, '.out'), rev: q(el, '.rev'), state: q(el, '.state'), login: q(el, '.login'),
    tile, pill: q(tile, '.pill'), open: q(tile, '.open'),
  }
  // Open shows the site's window so the user can log in or browse. Done hides it; the session stays in the lane's cookie store.
  const toggle = async () => {
    await (lanes.state(p.id) === 'needs-user' ? lanes.close(p.id) : lanes.login(p.id)).catch((e) => setStatus(String(e)))
    refresh()
  }
  const remove = async () => {
    await lanes.close(p.id).catch(() => undefined)
    providers.splice(providers.indexOf(p), 1)
    saveProviders(providers)
    card.wire.remove()
    el.remove()
    tile.remove()
    cards.delete(p.id)
    refresh()
  }
  card.login.onclick = card.open.onclick = toggle
  q(el, '.rm').onclick = q(tile, '.rm').onclick = remove
  cardsEl.insertBefore(el, addEl)
  $('tiles').append(tile)
  cards.set(p.id, card)
}
providers.forEach(addCard)
refresh()

async function connect(p: Provider) {
  providers.push(p)
  saveProviders(providers)
  lanes.urls[p.id] = p.url
  lanes.sels[p.id] = p.sel
  addCard(p)
  setStatus(`Log in to ${p.name} in the window that opened, then click Done on its tile.`)
  await lanes.login(p.id).catch((e) => setStatus(String(e)))
  refresh()
}

const openAdd = () => {
  const presets = $('presets')
  presets.replaceChildren()
  for (const p of PRESETS.filter((p) => !cards.has(p.id))) {
    const b = Object.assign(document.createElement('button'), { type: 'button', textContent: p.name })
    b.style.setProperty('--c', p.color)
    b.onclick = () => {
      dlg.close()
      void connect(p)
    }
    presets.append(b)
  }
  dlg.showModal()
}
addEl.onclick = $('addnew').onclick = $('addfirst').onclick = openAdd
$('cancel').onclick = () => dlg.close()
$<HTMLFormElement>('custom').onsubmit = (e) => {
  e.preventDefault()
  const f = e.target as HTMLFormElement
  const d = new FormData(f)
  const sel: Selectors = {}
  for (const k of ['input', 'send', 'stop', 'reply'] as const) {
    const v = String(d.get(k)).trim()
    if (v) sel[k] = v
  }
  const color = `hsl(${Math.floor(Math.random() * 360)} 60% 55%)`
  void connect({ id: customId(), name: String(d.get('name')).trim(), url: String(d.get('url')), color, sel })
  f.reset()
  dlg.close()
}

// A provider that has not seen this thread has no history, so hand it the last few turns.
// ponytail: plain-text replay of 3 turns, summarise if long threads matter.
function withContext(id: string, text: string) {
  if (lanes.urls[id] !== prov(id).url || !turns.length) return text
  const hist = turns.slice(-3).map((t) => `User: ${t.q}\nAssistant: ${t.a}`).join('\n\n')
  return `Context from earlier in this conversation:\n${hist}\n\nContinue with:\n${text}`
}

async function exec(id: string, text: string, el: HTMLElement) {
  el.textContent = '…'
  try {
    const r = await lanes.run(id, () => ask(id, text, (t) => (el.textContent = t)))
    lanes.urls[id] = r.url
    return r.text
  } catch (e) {
    el.textContent =
      e instanceof NeedsUser ? 'Log in in the window that just opened, then click Done on this card.' : `Error: ${(e as Error).message}`
  }
}

const MARK: Record<Verdict | 'unknown', string> = { agree: '✓ agree', partial: '~ partial', disagree: '✗ disagree', unknown: '? unclear' }

// Every model reviews all the others; the matrix shows who agrees with whom.
async function crossCheck(q: string, answers: Record<string, string>) {
  const ids = Object.keys(answers)
  if (ids.length < 2) return setStatus('Cross-check needs answers from at least 2 models.')
  setStatus('Cross-checking: each model is reviewing the others…')
  const grid = new Map<string, (Verdict | undefined)[]>()
  await Promise.all(
    ids.map(async (r) => {
      const others = ids.filter((o) => o !== r)
      const names = others.map((o) => prov(o).name)
      const { rev } = cards.get(r)!
      rev.hidden = false
      const text = await exec(r, reviewPrompt(q, names.map((name, i) => ({ name, text: answers[others[i]] }))), rev)
      grid.set(r, text ? parseVerdicts(text, names) : names.map(() => undefined))
    }),
  )

  const t = document.createElement('table')
  t.createCaption().textContent = 'Reviewer (row) on answer (column)'
  const head = t.createTHead().insertRow()
  head.append(document.createElement('th'))
  for (const id of ids) Object.assign(head.appendChild(document.createElement('th')), { textContent: prov(id).name })
  for (const r of ids) {
    const row = t.insertRow()
    Object.assign(row.appendChild(document.createElement('th')), { textContent: prov(r).name })
    const others = ids.filter((o) => o !== r)
    for (const o of ids) {
      const v = o === r ? undefined : grid.get(r)?.[others.indexOf(o)]
      const td = row.insertCell()
      td.className = v ?? 'unknown'
      td.textContent = o === r ? '—' : MARK[v ?? 'unknown']
    }
  }
  $('matrix').replaceChildren(t)
  setStatus('')
}

async function submit(q: string) {
  const ids = providers.map((p) => p.id).filter((id) => lanes.state(id) !== 'needs-user')
  if (!ids.length) return setStatus(providers.length ? 'Every app has its window open. Click Done on it first.' : 'Add a model first.')
  running = send.disabled = true
  try {
    $('matrix').replaceChildren()
    for (const c of cards.values()) Object.assign(c.rev, { textContent: '', hidden: true })
    setStatus(`Asking ${ids.length} model${ids.length > 1 ? 's' : ''}…`)
    const results = await Promise.all(ids.map(async (id) => [id, await exec(id, withContext(id, q), cards.get(id)!.out)] as const))
    const answers: Record<string, string> = {}
    for (const [id, a] of results) if (a) answers[id] = a
    const first = Object.values(answers)[0]
    if (first) turns.push({ q, a: first })
    setStatus('')
    if (mode === 'cross') await crossCheck(q, answers)
  } finally {
    running = send.disabled = false
  }
}

form.onsubmit = (e) => {
  e.preventDefault()
  const raw = prompt.value.trim()
  if (!raw || running) return
  prompt.value = ''
  void submit(raw)
}
prompt.onkeydown = (e) => {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
    e.preventDefault()
    form.requestSubmit()
  }
}
$('nav').onclick = (e) => {
  const b = (e.target as HTMLElement).closest('button')
  if (!b) return
  for (const x of $('nav').children) x.setAttribute('aria-current', String(x === b))
  $('apps').hidden = b.dataset.v !== 'apps'
  $('compare').hidden = b.dataset.v !== 'compare'
  drawWires()
}
$('mode').onclick = (e) => {
  const b = (e.target as HTMLElement).closest('button')
  if (!b) return
  mode = b.dataset.m as typeof mode
  for (const x of $('mode').children) x.setAttribute('aria-pressed', String(x === b))
}
// New thread: warm lanes still sit on the old conversation, so close them. Cookies stay on disk.
$('new').onclick = async () => {
  turns = []
  for (const p of providers) lanes.urls[p.id] = p.url
  await lanes.closeAll()
  for (const c of cards.values()) {
    c.out.textContent = ''
    Object.assign(c.rev, { textContent: '', hidden: true })
  }
  $('matrix').replaceChildren()
  setStatus('')
  refresh()
}
