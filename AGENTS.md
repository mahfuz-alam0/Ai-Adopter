# AI Adopter

Desktop app ("AI Hub") that sends one prompt to every connected AI by driving each provider's real web UI in a hidden Tauri webview ("lane"). No API keys. The user adds a model, logs in once in a visible window, then the app works that session in the background; cookies persist on disk.

UI: sidebar (pages, New thread, roster of connected AIs with live status, account) plus one page at a time. **Hub** (home) is laid out like a chat app: the chat on top listing every question with each AI's answer labelled by name, then the workflow (one small node per AI showing only its logo and a status dot, with a spinning ring while it works; a dashed "Connect an AI" node ends the row; the four steps Connect/Send/Think/Write and the elapsed time show in the chat and the run bar), and the prompt box docked at the bottom as the trigger node. Wires run from the top of the prompt box up to every node, with packets travelling out and back. Logos for the presets live in `lib/logos.ts` (custom providers show their first letter). Progress comes from `useThread` (`tracks`, `run`, `turns`), not from lane state. **Connections** lists every added app as a tile with status, Open/Done and Remove. Three modes: **Auto** (one AI answers, the quickest so far; speed is the only routing signal), **Parallel** (same prompt to all, answers side by side) and **Cross-check** (parallel, then each model reviews the others; a matrix shows who agrees with whom). Next to the modes sits a **Remote** switch (see Remote mode); remote requests take only parallel or cross.

## Layout

npm workspaces + Turborepo. Node 24 (runs `.ts` natively, no build step for tests or server).

- `apps/desktop` — Tauri 2 app, React 19 + TypeScript + Vite + Tailwind 4 (utility classes only). `index.html` is only the mount point.
  - `src/lib/` — no React, no DOM: `providers.ts` (`PRESETS`, persisted list in `localStorage.providers`), `cross.ts` (pure: `reviewPrompt()`, `parseVerdicts()`), `lanes.ts` (`LaneManager`: per-lane queue, max 4 live, idle sweep, eviction, `login()`, `warm()` (loads logged-in lanes in the background at startup, after login and after New thread, so the first prompt skips the page load); adding an AI always opens its login window, since guest prompt boxes look like a login; and `ask()`: send + poll until streaming stops), `auth.ts` (Google sign-in client, see below), `remote.ts` (poll loop that serves remote requests), `devlog.ts` (pure: formats the per-prompt timing trace that `ask()` prints; base.js records the in-page marks; Rust `dev_log` prints it in the dev terminal).
  - `src/state/` — hooks that own behavior: `useConnections` (providers, lane states, open/done/remove), `useThread` (modes, fan-out, cross-check, context replay), `useAccount`, `useRemote` (remote mode); `HubContext.tsx` joins them as `useHub()`. Components never touch `lanes` directly.
  - `src/pages/` — one file per page, registered in `pages/index.ts`, which gives each a route and a sidebar link (react-router `HashRouter` in `App.tsx`; pages without a nav entry, like `WelcomePage` at `/welcome`, are routed there). `/` redirects to `/welcome` while no AI can answer.
  - `src/components/` — presentational pieces (`Sidebar`, `Console`, `ModelCard`, `Wires`, `Matrix`, `ConnectDialog`, `ConnectionTile`, ...). Styling is Tailwind utilities in the JSX; `src/index.css` holds only theme tokens (light/dark), keyframes and the pointer cursor rule for buttons. Do not add per-component CSS files. `Button.tsx` owns the shared button looks.
  - `src-tauri/src/lib.rs` — Rust commands: `lane_open` (takes the selector JSON), `lane_eval`, `lane_show`, `lane_close`, `open_url`, `auth_listen`.
  - `src-tauri/lanes/base.js` — shared driver (`window.__lane.ready/send/read`) with auto-detect default selectors. Per-provider selectors arrive as `window.__SEL`, injected by Rust.
- `apps/server` — bare `node:http` server (port 4000), no dependencies. `src/index.ts` routes, `src/auth.ts` holds Google sign-in, PKCE code exchange, signed sessions, `src/remote.ts` the remote relay. No pages: apps/web is its face.
- `apps/web` — Next.js (App Router, port 3000). Standard `src/` layout: routes in `src/app/`, static files in `public/`, `@/*` aliases `src/*`. The public origin for sign-in: `src/app/page.tsx` is the sign-in page, `next.config.ts` proxies `/auth/*`, `/logout` and `/me` to the server. Only login so far.

## Google sign-in (AI Hub account)

Optional, identity only: it does not log in to Claude, ChatGPT, etc. Those sites keep their own sessions in the lane cookie stores, and Google blocks its own sign-in inside embedded webviews, so provider logins use email or code on the provider site.

Flow: desktop `signIn()` (`apps/desktop/src/auth.ts`) starts a loopback listener (`auth_listen`) and opens `apps/web` `/?port&challenge` in the default browser (`open_url`). The page links to `/auth/google?port&challenge`, which the proxy passes to `apps/server`. The server runs Google OAuth, redirects the browser to `http://127.0.0.1:<port>/cb?code=<one-time>`, and the app redeems it at `POST /auth/exchange` (also via the proxy) with the PKCE verifier for a signed session token. Without `port`/`challenge`, `/` is the plain web sign-in and the server sets a session cookie. `BASE_URL` in the server env is apps/web's public URL (Google's redirect target); desktop reads `VITE_AUTH_URL` (default `http://localhost:3000`). Server env vars: see `apps/server/.env.example`. Server tests fake Google's token endpoint via `GOOGLE_TOKEN_URL`.

## Remote mode

Lets another device or script use the connected AIs through the server's API. Sessions stay in the desktop app, so the app is the worker and the server only relays; nothing inbound reaches the machine.

Flow: with Remote on (Remote page, needs sign-in), `serve()` in `lib/remote.ts` long-polls `POST /remote/poll` (session token) and reports the AIs it has. An API client calls `POST /v1/ask {prompt, mode?, models?}` (API key from `POST /remote/key`; one key per user, a new one revokes the old). The server queues the job for that user's app, the app runs it through `useThread.submit()` (same lanes, same UI as a typed prompt, shown in the Hub), posts `POST /remote/result`, and the server answers the held `/v1/ask` with `{answers, errors, matrix}`. `GET /v1/models` lists the AIs; 503 `host_offline` when the app is not polling. Routes are proxied by apps/web (`next.config.ts`, with a long `proxyTimeout` for `/v1/ask`). `remote.ts` state is in memory (keys and queued jobs die on restart). Tests: `apps/server/src/index.test.ts`.

## Commands

Run from repo root.

- `npm run dev:tauri` — desktop app with hot reload
- `npm run dev:server` — server with `--watch`
- `npm run dev:web` — web (3000) plus server (4000); needed for sign-in
- `npm run build:tauri` — bundled desktop app
- `npm run build:server` / `npm run build` — via turbo
- `npm test` — all tests. Single: `npm test -w desktop` or `npm test -w server`
- `npm run web -w desktop` — frontend alone in a browser (UI only; lanes need Tauri)

Tests are plain `node:assert` scripts, no framework, only for `src/lib`. Add checks to the existing `*.test.ts` files; keep them runnable with `node <file>`.

## Rules

- **Lane windows get no Tauri capability.** Provider pages are untrusted. Rust reaches them only through `eval`; they cannot call back into Rust. Do not add permissions to `capabilities/` for lane windows.
- **`window.__lane` methods must never throw** and must return JSON strings. Exceptions are invisible to `eval_with_callback` on Windows. Report failures via `window.__lane.err`.
- **Selectors drift.** Provider-specific DOM knowledge lives in `PRESETS` (`providers.ts`) or in a custom provider's selector fields, never in `base.js` logic. When a card goes red, fix selectors there. All preset selectors are unverified guesses until checked against the live page in DevTools. Presets without `sel` rely on `base.js` auto-detect.
- **Lane ids are short and plain**: `[A-Za-z0-9_-]`, max 16 bytes (window label, data-dir name, macOS store id). Rust rejects anything else. Lane URLs must be http(s).
- **Lane state must come from the page, not from clicks.** `LaneManager.ok[id]` is the last probe of `window.__lane.ready()` (persisted as `localStorage.logins`); `state()` reports `unknown`, `logged-out`, `cold`, `ready`, `busy`, `needs-user`, `checking` from it. Closing a login window only hides it (Rust, emits `lane-hidden`); `finish()` probes the page, records the result, then closes the lane. A login window closes itself (`watch()`) once the prompt box appears after having been absent; sites that show it to logged-out visitors need Done. Never mark a lane logged in because the user clicked Done. `canSend()` gates sending.
- **`evalJs` has a timeout** because `eval_with_callback` may never call back. Keep every eval path under a cap.
- **Cookie isolation is per provider.** `data_directory` per lane, plus `data_store_identifier` on macOS. Do not share a store across lanes.
- Keep `cross.ts` pure (no DOM, no Tauri imports) so it stays testable under plain Node.
- Provider names and URLs render as React text children only. Never `dangerouslySetInnerHTML`; the main window has Tauri access.
- Lane/provider logic lives in `src/lib` and `src/state`. Components render and call `useHub()`; they do not call `invoke` or `lanes`.
- Prefer the smallest change. No new dependencies for what a few lines or the platform covers. Mark deliberate shortcuts with a `ponytail:` comment naming the ceiling and upgrade path.

## Style

- TypeScript strict, ESM, `.ts`/`.tsx` extensions in imports (Node runs `src/lib` directly).
- No semicolons, single quotes, 2-space indent, trailing commas in multiline. Match surrounding code.
- Comments explain *why* (a quirk, a platform bug), not *what*.
- Rust: `rustfmt` defaults, errors mapped to `String` at the command boundary.

## Before finishing a change

1. `npm test` passes.
2. Type check desktop: `npx tsc --noEmit -p apps/desktop`.
3. Rust touched: `cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml`.
4. Behavior in a real lane cannot be tested headlessly. Say so instead of claiming it works.

## Do not commit

`node_modules`, `dist`, `target`, `.turbo` (already in `.gitignore`).
