// Shared lane driver. Reads selectors from window.__SEL (injected above it from the provider config).
// Every method returns a JSON string and never throws: exceptions are invisible to eval_with_callback on Windows.
(() => {
  // Best-effort guesses for sites with no verified selectors; entries in window.__SEL win.
  const S = {
    input: 'textarea, div[contenteditable="true"], [role="textbox"]',
    send: 'button[type="submit"], button[aria-label*="send" i], button[data-testid*="send" i]',
    stop: 'button[aria-label*="stop" i], button[data-testid*="stop" i]',
    reply: '[data-message-author-role="assistant"], [class*="markdown"], [class*="assistant" i]',
    ...window.__SEL,
  }
  const $ = (s) => document.querySelector(s)
  const wait = (ms) => new Promise((r) => setTimeout(r, ms))

  window.__lane = {
    ready: () => JSON.stringify(Boolean($(S.input))),

    async send(text) {
      try {
        $(S.input).focus()
        document.execCommand('insertText', false, text)
        // The button shows up a frame after the input event. None after 400ms: the site sends on Enter,
        // so do not burn seconds waiting for a button that never comes.
        let btn
        for (let i = 0; i < 120; i++) {
          btn = $(S.send)
          if (btn ? !btn.disabled : i >= 16) break
          await wait(25)
        }
        if (btn) btn.click()
        else $(S.input).dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }))
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
