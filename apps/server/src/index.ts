import { createServer } from 'node:http'
import { callback, exchange, logout, me, start } from './auth.ts'
import { ask, mintKey, models, poll, result } from './remote.ts'

// The desktop webview calls /auth/exchange and /me cross-origin: tauri://localhost (macOS, Linux),
// http://tauri.localhost (Windows), http://localhost:1420 (tauri dev). Those calls arrive through apps/web's
// proxy, which forwards Origin and the CORS reply untouched.
const origins = (process.env.ALLOWED_ORIGINS ?? 'tauri://localhost,http://tauri.localhost,http://localhost:1420').split(',')

export const server = createServer(async (req, res) => {
  const origin = req.headers.origin
  if (origin && origins.includes(origin)) {
    res.setHeader('access-control-allow-origin', origin)
    res.setHeader('access-control-allow-headers', 'authorization, content-type')
    res.setHeader('vary', 'origin')
  }
  if (req.method === 'OPTIONS') return void res.writeHead(204).end()

  const url = new URL(req.url ?? '/', 'http://localhost')
  try {
    switch (`${req.method} ${url.pathname}`) {
      case 'GET /health':
        res.writeHead(200, { 'content-type': 'application/json' })
        return void res.end(JSON.stringify({ ok: true }))
      case 'GET /logout':
        return logout(res)
      case 'GET /auth/google':
        return start(res, url.searchParams)
      case 'GET /auth/google/callback':
        return await callback(req, res, url.searchParams)
      case 'POST /auth/exchange':
        return await exchange(req, res)
      case 'GET /me':
        return me(req, res)
      case 'POST /remote/key':
        return mintKey(req, res)
      case 'POST /remote/poll':
        return await poll(req, res)
      case 'POST /remote/result':
        return await result(req, res)
      case 'GET /v1/models':
        return models(req, res)
      case 'POST /v1/ask':
        return await ask(req, res)
    }
    res.writeHead(404).end()
  } catch (e) {
    console.error(e)
    if (!res.headersSent) res.writeHead(500)
    res.end()
  }
})

// Skip listen when imported by the test.
if (process.argv[1] === import.meta.filename) {
  const port = Number(process.env.PORT ?? 4000)
  server.listen(port, () => console.log(`server on :${port}`))
}
