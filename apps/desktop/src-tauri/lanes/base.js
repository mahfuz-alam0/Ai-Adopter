// Shared lane driver. Reads selectors from window.__SEL (injected above it from the provider config).
// Every method returns a JSON string and never throws: exceptions are invisible to eval_with_callback on Windows.
(() => {
  // Best-effort guesses for sites with no verified selectors; entries in window.__SEL win.
  const D = {
    input: 'textarea, div[contenteditable="true"], [role="textbox"]',
    send: 'button[type="submit"], button[aria-label*="send" i], button[data-testid*="send" i]',
    stop: 'button[aria-label*="stop" i], button[data-testid*="stop" i]',
    reply: '[data-message-author-role="assistant"], [class*="markdown"], [class*="assistant" i]',
  }
  const S = { ...D, ...window.__SEL }
  const $ = (s) => document.querySelector(s)
  // First match that is laid out. Sites keep hidden copies (ChatGPT's fallback textarea), which cannot take text.
  const shown = (s) => [...document.querySelectorAll(s)].find((e) => e.getClientRects().length)
  // The prompt box is the login signal, and a redesign breaks the preset input selector first. Without this
  // fallback a logged-in lane read as logged out, so the login window never closed and sending stayed off.
  const box = () => $(S.input) || shown(D.input)
  const wait = (ms) => new Promise((r) => setTimeout(r, ms))

  // Lanes run in hidden windows. WebKit reports a hidden page as hidden and pauses requestAnimationFrame there,
  // and chat sites paint streamed tokens on animation frames, so replies reached the DOM late or all at once.
  // Tell the page it is visible, and drive frames from timers while it really is hidden (a shown login window keeps real frames).
  // Guarded: if this throws, window.__lane below must still be defined.
  try {
    const hidden = Object.getOwnPropertyDescriptor(Document.prototype, 'hidden').get
    Object.defineProperty(document, 'hidden', { get: () => false })
    Object.defineProperty(document, 'visibilityState', { get: () => 'visible' })
    const raf = window.requestAnimationFrame.bind(window)
    const caf = window.cancelAnimationFrame.bind(window)
    // Negative ids are timers, so cancel knows which kind it holds.
    window.requestAnimationFrame = (cb) => (hidden.call(document) ? -setTimeout(() => cb(performance.now()), 16) : raf(cb))
    window.cancelAnimationFrame = (id) => (id < 0 ? clearTimeout(-id) : caf(id))
  } catch {}

  // The reply streams over fetch as SSE/ndjson on most sites. Stream end is the exact "done" signal, so the
  // caller need not wait for the page to look quiet. Text still comes from the DOM: every site's stream format differs.
  // net.t / net.reqs are the dev timing log (see lib/devlog.ts): when each step happened in the page, and every fetch after send.
  const net = { open: 0, seen: 0, t: {}, reqs: [] }
  const realFetch = window.fetch
  if (realFetch) {
    window.fetch = async function (...args) {
      const t0 = Date.now()
      const res = await realFetch.apply(this, args)
      try {
        const t = net.t
        if (t.send && net.reqs.length < 40) net.reqs.push([new URL(res.url).pathname.slice(-60), t0 - t.send, Date.now() - t0, res.status])
        if (res.body && /event-stream|ndjson/i.test(res.headers.get('content-type') || '')) {
          net.open++
          net.seen++
          if (t.send && !t.preq) {
            t.preq = t0
            t.phead = Date.now()
          }
          const r = res.clone().body.getReader()
          void (async () => {
            try {
              while (!(await r.read()).done) if (!t.pchunk) t.pchunk = Date.now()
            } catch {}
            if (!--net.open) t.pend = Date.now()
          })()
        }
      } catch {}
      return res
    }
  }

  window.__lane = {
    // A prompt box alone is not a login: some sites show it to guests, and S.out marks those.
    // Only a visible S.out counts, so a hidden copy in a logged-in page does not mark it as a guest.
    ready: () => JSON.stringify(Boolean(box()) && !(S.out && shown(S.out))),

    async send(text) {
      try {
        net.seen = 0
        net.reqs = []
        const t = (net.t = { send: Date.now() })
        const input = box()
        input.focus()
        document.execCommand('insertText', false, text)
        t.typed = Date.now()
        // The button shows up a frame after the input event. None after 400ms: the site sends on Enter,
        // so do not burn seconds waiting for a button that never comes.
        let btn
        for (let i = 0; i < 120; i++) {
          btn = $(S.send)
          if (btn ? !btn.disabled : i >= 16) break
          await wait(25)
        }
        if (btn) btn.click()
        else input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }))
        t.click = Date.now()
        // Text still in the box and nothing generating means the site ignored the click (a hidden window drops it
        // while the editor is still syncing). A real send clears the box at once, so this exits on the first check.
        const left = () => ((box() || {}).value ?? (box() || {}).innerText ?? '').trim()
        for (let i = 0; i < 24 && left() && !$(S.stop); i++) await wait(25)
        if (left() && !$(S.stop)) box().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }))
      } catch (e) {
        window.__lane.err = String(e)
      }
    },

    // full adds the dev timing log; polls leave it out to stay small.
    read(full) {
      const replies = document.querySelectorAll(S.reply)
      const last = replies[replies.length - 1]
      return JSON.stringify({
        text: last ? last.innerText : '',
        streaming: Boolean($(S.stop)),
        count: replies.length,
        // A stream started since send and none is still open. 0 = no stream seen: the site does not stream over fetch SSE.
        net: net.seen ? (net.open ? 1 : 2) : 0,
        url: location.href,
        err: window.__lane.err || '',
        at: Date.now(),
        ...(full ? { t: net.t, reqs: net.reqs } : {}),
      })
    },
  }
})()
