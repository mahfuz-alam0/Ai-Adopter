// Selectors drift. Verify against the live page (DevTools) when the health badge goes red.
window.__SEL = {
  input: '#prompt-textarea',
  send: 'button[data-testid="send-button"]',
  stop: 'button[data-testid="stop-button"]',
  reply: '[data-message-author-role="assistant"]',
}
