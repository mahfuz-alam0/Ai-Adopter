// Shared lane driver. Reads selectors from window.__SEL (set by the provider file above it).
// Every method returns a JSON string and never throws: exceptions are invisible to eval_with_callback on Windows.
(() => {
  const S = window.__SEL
  const $ = (s) => document.querySelector(s)
  const wait = (ms) => new Promise((r) => setTimeout(r, ms))

  window.__lane = {
    ready: () => JSON.stringify(Boolean($(S.input))),

    async send(text) {
      try {
        $(S.input).focus()
        document.execCommand('insertText', false, text)
        for (let i = 0; i < 50; i++) {
          const btn = $(S.send)
          if (btn && !btn.disabled) break
          await wait(100)
        }
        $(S.send).click()
      } catch (e) {
        window.__lane.err = String(e)
      }
    },

    read() {
      const replies = document.querySelectorAll(S.reply)
      const last = replies[replies.length - 1]
      return JSON.stringify({
        text: last ? last.innerText : '',
        streaming: Boolean($(S.stop)),
        count: replies.length,
        url: location.href,
        err: window.__lane.err || '',
      })
    },
  }
})()
