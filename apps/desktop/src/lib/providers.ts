export interface Selectors { input?: string; send?: string; stop?: string; reply?: string }
export interface Provider { id: string; name: string; url: string; color: string; sel?: Selectors }

// Selectors drift. Verify against the live page (DevTools) when a card goes red.
// UNVERIFIED guesses, none inspected against the live sites. No sel = base.js auto-detect.
export const PRESETS: Provider[] = [
  {
    id: 'claude', name: 'Claude', url: 'https://claude.ai/new', color: '#e07a5f',
    sel: {
      input: 'div[contenteditable="true"]',
      send: 'button[aria-label="Send message"]',
      stop: 'button[aria-label="Stop response"]',
      reply: '.font-claude-response',
    },
  },
  {
    id: 'chatgpt', name: 'ChatGPT', url: 'https://chatgpt.com/', color: '#10a37f',
    sel: {
      input: '#prompt-textarea',
      send: 'button[data-testid="send-button"]',
      stop: 'button[data-testid="stop-button"]',
      reply: '[data-message-author-role="assistant"]',
    },
  },
  {
    id: 'gemini', name: 'Gemini', url: 'https://gemini.google.com/app', color: '#5b8def',
    sel: {
      input: 'rich-textarea .ql-editor',
      send: 'button[aria-label="Send message"]',
      stop: 'button[aria-label="Stop response"]',
      reply: 'model-response message-content',
    },
  },
  { id: 'grok', name: 'Grok', url: 'https://grok.com/', color: '#8f8eab' },
  { id: 'perplexity', name: 'Perplexity', url: 'https://www.perplexity.ai/', color: '#20b8cd' },
  { id: 'deepseek', name: 'DeepSeek', url: 'https://chat.deepseek.com/', color: '#4d6bfe' },
]

// Ids double as Tauri window labels and macOS store ids (16 bytes max, checked in Rust), so keep custom ones short.
export const customId = () => `x-${Math.random().toString(36).slice(2, 10)}`

const KEY = 'providers'
export const loadProviders = (): Provider[] => JSON.parse(localStorage.getItem(KEY) ?? '[]')
export const saveProviders = (all: Provider[]) => localStorage.setItem(KEY, JSON.stringify(all))
