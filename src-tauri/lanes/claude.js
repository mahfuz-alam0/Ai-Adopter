// Selectors drift. Verify against the live page (DevTools) when the health badge goes red.
// UNVERIFIED guesses, not inspected against live claude.ai.
window.__SEL = {
  input: 'div[contenteditable="true"]',
  send: 'button[aria-label="Send message"]',
  stop: 'button[aria-label="Stop response"]',
  reply: '.font-claude-response',
}
