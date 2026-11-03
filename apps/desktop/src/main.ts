import { LaneManager, NeedsUser, ask } from './lanes.ts'
import { pick } from './router.ts'
import type { Decision, LaneInfo, ProviderId, TaskType } from './router.ts'

const BASE: Record<ProviderId, string> = {
  chatgpt: 'https://chatgpt.com/',
  claude: 'https://claude.ai/new',
  gemini: 'https://gemini.google.com/app',
}
const IDS = Object.keys(BASE) as ProviderId[]
const lanes = new LaneManager({ ...BASE })

interface Thread { provider?: ProviderId; type?: TaskType; turns: { q: string; a: string }[] }
let thread: Thread = { turns: [] }

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T
const prompt = $<HTMLTextAreaElement>('prompt')
const chip = $('chip')

$('panes').innerHTML = IDS.map(
  (id) => `<section data-p="${id}"><h2>${id}<span class="badge" id="b-${id}"></span></h2><pre id="o-${id}"></pre></section>`,
).join('')
const out = (id: ProviderId) => $<HTMLPreElement>(`o-${id}`)

function renderBadges() {
  for (const id of IDS) {
    const b = $(`b-${id}`)
    const s = lanes.state(id)
    b.textContent = s === 'needs-user' ? 'login needed (click to retry)' : s
    b.className = `badge ${s}`
  }
}
setInterval(renderBadges, 1000)
renderBadges()
// A login-needed lane is hidden from the router; clicking its badge closes it so it can be tried again.
for (const id of IDS) $(`b-${id}`).onclick = () => lanes.state(id) === 'needs-user' && void lanes.close(id).then(renderBadges)

const info = (): Record<ProviderId, LaneInfo> =>
  Object.fromEntries(
    IDS.map((id) => [id, { health: lanes.state(id) === 'needs-user' ? 'login-needed' : 'ready', warm: lanes.isWarm(id) }]),
  ) as Record<ProviderId, LaneInfo>

function log(entry: object) {
  console.info('[router]', entry)
  const all = JSON.parse(localStorage.getItem('decisions') ?? '[]')
  all.push({ at: new Date().toISOString(), ...entry })
  localStorage.setItem('decisions', JSON.stringify(all.slice(-500)))
}

// A provider that has not seen this thread has no history, so hand it the last few turns.
// ponytail: plain-text replay of 3 turns, summarise if long threads matter.
function withContext(id: ProviderId, text: string) {
  if (lanes.urls[id] !== BASE[id] || !thread.turns.length) return text
  const hist = thread.turns.slice(-3).map((t) => `User: ${t.q}\nAssistant: ${t.a}`).join('\n\n')
  return `Context from earlier in this conversation:\n${hist}\n\nContinue with:\n${text}`
}

async function runOn(id: ProviderId, text: string) {
  const el = out(id)
  el.textContent = '…'
  try {
    const r = await lanes.run(id, () => ask(id, withContext(id, text), (t) => (el.textContent = t)))
    lanes.urls[id] = r.url
    thread.turns.push({ q: text, a: r.text })
    return r.text
  } catch (e) {
    el.textContent =
      e instanceof NeedsUser ? `Log in in the window that just opened, then resend.` : `Error: ${(e as Error).message}`
  }
}

function showChip(d: Decision) {
  chip.innerHTML = ''
  const tag = Object.assign(document.createElement('b'), { textContent: `${d.type} → ${d.provider} (${d.reason})` })
  chip.append(tag)
  for (const alt of d.alternatives) chip.append(btn(`rerun on ${alt}`, () => void runOn(alt, d.prompt)))
  chip.append(btn('compare all', () => void compare(d.prompt)))
}
const btn = (label: string, fn: () => void) => Object.assign(document.createElement('button'), { textContent: label, onclick: fn })

async function compare(text: string) {
  const ids = IDS.filter((id) => info()[id].health === 'ready')
  log({ compare: ids, prompt: text })
  await Promise.allSettled(ids.map((id) => runOn(id, text)))
}

async function submit(raw: string) {
  const d = pick(raw, info(), thread.provider && thread.type ? { provider: thread.provider, type: thread.type } : undefined)
  if (!d) return void (chip.textContent = 'No lane is ready. Click a red badge to retry.')
  log({ decision: d.provider, type: d.type, reason: d.reason, alternatives: d.alternatives })
  showChip(d)
  thread.provider = d.provider
  thread.type = d.type
  await runOn(d.provider, d.prompt)
}

$<HTMLFormElement>('form').onsubmit = (e) => {
  e.preventDefault()
  const raw = prompt.value.trim()
  if (!raw) return
  prompt.value = ''
  void submit(raw)
}
prompt.onkeydown = (e) => {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
    e.preventDefault()
    $<HTMLFormElement>('form').requestSubmit()
  }
}
$('compare').onclick = () => {
  const raw = prompt.value.trim()
  if (!raw) return
  prompt.value = ''
  void compare(raw)
}
// New thread: warm lanes still sit on the old conversation, so close them. Cookies stay on disk.
$('new').onclick = async () => {
  thread = { turns: [] }
  Object.assign(lanes.urls, BASE)
  await lanes.closeAll()
  for (const id of IDS) out(id).textContent = ''
  chip.textContent = ''
}
