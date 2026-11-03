import { useState } from 'react'
import { currentUser, signIn, signOut } from '../lib/auth.ts'

// Optional AI Hub account. It does not log in to the providers; their sessions live in the lane cookie stores.
export function useAccount(setStatus: (t: string) => void) {
  const [user, setUser] = useState(currentUser)
  const [busy, setBusy] = useState(false)

  async function toggle() {
    if (user) {
      signOut()
      return setUser(null)
    }
    setBusy(true)
    setStatus('Finish signing in in your browser…')
    await signIn().then(
      (u) => {
        setUser(u)
        setStatus('')
      },
      (e) => setStatus(String(e)),
    )
    setBusy(false)
  }

  return { user, busy, toggle }
}
