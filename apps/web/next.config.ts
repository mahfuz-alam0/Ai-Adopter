import type { NextConfig } from 'next'

const server = process.env.SERVER_URL ?? 'http://localhost:4000'

// The browser only ever talks to this origin. OAuth, the session cookie and the desktop token calls live in
// apps/server and are proxied, so BASE_URL (Google's redirect target) is this app's public URL.
const config: NextConfig = {
  rewrites: async () => [
    { source: '/auth/:path*', destination: `${server}/auth/:path*` },
    { source: '/logout', destination: `${server}/logout` },
    { source: '/me', destination: `${server}/me` },
  ],
  headers: async () => [
    { source: '/:path*', headers: [{ key: 'Content-Security-Policy', value: "frame-ancestors 'none'" }] },
  ],
}

export default config
