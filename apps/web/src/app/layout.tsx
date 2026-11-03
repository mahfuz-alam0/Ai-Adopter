import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = { title: 'AI Hub', icons: '/logo.svg' }

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
