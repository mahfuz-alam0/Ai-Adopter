import { useEffect, useState } from 'react'

// Re-renders the caller every `ms` while `active`, for elapsed-time readouts.
export function useNow(active: boolean, ms = 100) {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    if (!active) return
    setNow(Date.now())
    const t = setInterval(() => setNow(Date.now()), ms)
    return () => clearInterval(t)
  }, [active, ms])
  return now
}
