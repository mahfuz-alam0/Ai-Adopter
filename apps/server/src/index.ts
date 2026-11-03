import { createServer } from 'node:http'

export const server = createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' })
    return void res.end(JSON.stringify({ ok: true }))
  }
  res.writeHead(404).end()
})

// Skip listen when imported by the test.
if (process.argv[1] === import.meta.filename) {
  const port = Number(process.env.PORT ?? 3000)
  server.listen(port, () => console.log(`server on :${port}`))
}
