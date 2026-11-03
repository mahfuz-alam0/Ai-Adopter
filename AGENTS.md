# AI Adopter

Desktop app ("AI Hub") that sends one prompt to every connected AI by driving each provider's real web UI in a hidden Tauri webview ("lane"). No API keys. The user adds a model, logs in once in a visible window, then the app works that session in the background; cookies persist on disk.

UI: two tabs. **Apps** (home) lists every added app as a tile with status, Open/Done and Remove, plus a "+ Add new" button. **Compare** is a hub: the prompt box is the center node, connector wires run to one card per model, and a dashed "+ Add model" card ends the row. Two modes only: **Parallel** (same prompt to all, answers side by side) and **Cross-check** (parallel, then each model reviews the others; a matrix shows who agrees with whom). There is no auto-routing.

## Layout

npm workspaces + Turborepo. Node 24 (runs `.ts` natively, no build step for tests or server).

- `apps/desktop` — Tauri 2 app, vanilla TypeScript + Vite, no UI framework.
  - `src/providers.ts` — `PRESETS` (name, URL, selectors) and the persisted provider list (`localStorage.providers`).
  - `src/cross.ts` — pure: `reviewPrompt()` and `parseVerdicts()` for Cross-check.
  - `src/lanes.ts` — `LaneManager` (per-lane queue, max 4 live, idle sweep, eviction, `login()`) and `ask()` (send + poll until streaming stops).
  - `src/main.ts` — Apps tiles, Compare hub DOM, wires, add dialog, modes, thread context replay.
  - `src/auth.ts` — Google sign-in client (see below).
  - `src-tauri/src/lib.rs` — Rust commands: `lane_open` (takes the selector JSON), `lane_eval`, `lane_show`, `lane_close`, `open_url`, `auth_listen`.
  - `src-tauri/lanes/base.js` — shared driver (`window.__lane.ready/send/read`) with auto-detect default selectors. Per-provider selectors arrive as `window.__SEL`, injected by Rust.
- `apps/server` — bare `node:http` server (port 4000), no dependencies. `src/index.ts` routes, `src/auth.ts` holds Google sign-in, PKCE code exchange, signed sessions. No pages: apps/web is its face.
- `apps/web` — Next.js (App Router, port 3000). The public origin for sign-in: `app/page.tsx` is the sign-in page, `next.config.ts` proxies `/auth/*`, `/logout` and `/me` to the server. Only login so far.

## Google sign-in (AI Hub account)

Optional, identity only: it does not log in to Claude, ChatGPT, etc. Those sites keep their own sessions in the lane cookie stores, and Google blocks its own sign-in inside embedded webviews, so provider logins use email or code on the provider site.

Flow: desktop `signIn()` (`apps/desktop/src/auth.ts`) starts a loopback listener (`auth_listen`) and opens `apps/web` `/?port&challenge` in the default browser (`open_url`). The page links to `/auth/google?port&challenge`, which the proxy passes to `apps/server`. The server runs Google OAuth, redirects the browser to `http://127.0.0.1:<port>/cb?code=<one-time>`, and the app redeems it at `POST /auth/exchange` (also via the proxy) with the PKCE verifier for a signed session token. Without `port`/`challenge`, `/` is the plain web sign-in and the server sets a session cookie. `BASE_URL` in the server env is apps/web's public URL (Google's redirect target); desktop reads `VITE_AUTH_URL` (default `http://localhost:3000`). Server env vars: see `apps/server/.env.example`. Server tests fake Google's token endpoint via `GOOGLE_TOKEN_URL`.

## Commands

Run from repo root.

- `npm run dev:tauri` — desktop app with hot reload
- `npm run dev:server` — server with `--watch`
- `npm run dev:web` — web (3000) plus server (4000); needed for sign-in
- `npm run build:tauri` — bundled desktop app
- `npm run build:server` / `npm run build` — via turbo
- `npm test` — all tests. Single: `npm test -w desktop` or `npm test -w server`
- `npm run web -w desktop` — frontend alone in a browser (lanes will not work, they need Tauri)

Tests are plain `node:assert` scripts, no framework. Add checks to the existing `*.test.ts` files; keep them runnable with `node <file>`.

## Rules

- **Lane windows get no Tauri capability.** Provider pages are untrusted. Rust reaches them only through `eval`; they cannot call back into Rust. Do not add permissions to `capabilities/` for lane windows.
- **`window.__lane` methods must never throw** and must return JSON strings. Exceptions are invisible to `eval_with_callback` on Windows. Report failures via `window.__lane.err`.
- **Selectors drift.** Provider-specific DOM knowledge lives in `PRESETS` (`providers.ts`) or in a custom provider's selector fields, never in `base.js` logic. When a card goes red, fix selectors there. All preset selectors are unverified guesses until checked against the live page in DevTools. Presets without `sel` rely on `base.js` auto-detect.
- **Lane ids are short and plain**: `[A-Za-z0-9_-]`, max 16 bytes (window label, data-dir name, macOS store id). Rust rejects anything else. Lane URLs must be http(s).
- **Never `innerHTML` provider names or URLs.** Use `textContent`; the main window has Tauri access.
- **`evalJs` has a timeout** because `eval_with_callback` may never call back. Keep every eval path under a cap.
- **Cookie isolation is per provider.** `data_directory` per lane, plus `data_store_identifier` on macOS. Do not share a store across lanes.
- Keep `cross.ts` pure (no DOM, no Tauri imports) so it stays testable under plain Node.
- Prefer the smallest change. No new dependencies for what a few lines or the platform covers. Mark deliberate shortcuts with a `ponytail:` comment naming the ceiling and upgrade path.

## Style

- TypeScript strict, ESM, `.ts` extensions in imports (Node runs them directly).
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
