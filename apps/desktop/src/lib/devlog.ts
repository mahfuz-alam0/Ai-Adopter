// Timing trace of one prompt in one lane: where did the seconds go? Pure (no DOM, no Tauri) so it runs under plain Node.
// Main-side marks and in-page marks are epoch ms from the same machine clock, so they sort into one timeline.

export type Marks = Record<string, number>
// Fetch seen in the page after send: [path, start offset from send, ms until response headers, status].
export type Req = [string, number, number, number]
export interface Polls { n: number; rtt: number; rttMax: number; toPage: number; toPageMax: number; fromPage: number; fromPageMax: number }

// Which mark is which, in plain words. Marks not set (a warm lane has no ready-probe wait) are skipped.
const LABEL: Record<string, string> = {
  enq: 'prompt queued for lane',
  start: 'lane free, run starts',
  opened: 'window open (lane_open)',
  probed: 'page ready (prompt box found)',
  ask0: 'ask() starts',
  preread: 'first read done',
  sentEval: 'send eval returned',
  psend: 'page: send() entered',
  ptyped: 'page: text typed',
  pclick: 'page: send clicked / Enter',
  preq: 'page: reply request started',
  phead: 'page: reply response headers',
  pchunk: 'page: first reply bytes',
  firstReply: 'app: reply element appeared',
  firstText: 'app: first text seen',
  lastChange: 'app: last text change seen',
  pend: 'page: reply stream ended',
  netSeen: 'app: saw stream ended',
  done: 'ask() returns',
}

const avg = (sum: number, n: number) => (n ? Math.round(sum / n) : 0)

export function formatTrace(lane: string, cold: boolean, m: Marks, reqs: Req[], p: Polls): string {
  const t0 = m.enq ?? m.ask0 ?? 0
  const rows = Object.entries(m)
    .filter(([k, v]) => LABEL[k] && v)
    .sort((a, b) => a[1] - b[1])
  let prev = t0
  const lines = rows.map(([k, v]) => {
    const line = `  +${String(v - prev).padStart(5)}ms  @${String(v - t0).padStart(5)}ms  ${LABEL[k]}`
    prev = v
    return line
  })
  const total = (m.done ?? prev) - t0
  const head = `[${lane}] ${(total / 1000).toFixed(2)}s total (${cold ? 'cold: page had to load' : 'warm lane'})`
  const net = reqs.map(([u, at, ms, st]) => `  req +${at}ms after send, headers in ${ms}ms, ${st} ${u}`)
  const poll = `  polls ${p.n}: eval round trip avg ${avg(p.rtt, p.n)}ms max ${p.rttMax}ms (to page avg ${avg(p.toPage, p.n)} max ${p.toPageMax}, back avg ${avg(p.fromPage, p.n)} max ${p.fromPageMax})`
  return [head, ...lines, ...net, poll].join('\n')
}
