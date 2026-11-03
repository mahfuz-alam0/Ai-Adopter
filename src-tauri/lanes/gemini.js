// Selectors drift. Verify against the live page (DevTools) when the health badge goes red.
// UNVERIFIED guesses, not inspected against live gemini.google.com.
window.__SEL = {
  input: 'rich-textarea .ql-editor',
  send: 'button[aria-label="Send message"]',
  stop: 'button[aria-label="Stop response"]',
  reply: 'model-response message-content',
}
