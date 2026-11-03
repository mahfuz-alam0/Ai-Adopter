import { Component } from 'react'
import type { ReactNode } from 'react'
import { Button } from './Button.tsx'

// Without a boundary, one render error unmounts the whole tree and the window goes blank with no clue why.
export class ErrorBoundary extends Component<{ children: ReactNode }, { error?: Error }> {
  state: { error?: Error } = {}

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    return (
      <div className="grid h-screen place-items-center p-8" role="alert">
        <div className="flex max-w-xl flex-col items-start gap-3">
          <b className="text-base">Something broke while drawing the app.</b>
          <pre className="max-h-60 w-full overflow-auto rounded-lg border border-line bg-panel2 p-3 text-xs whitespace-pre-wrap select-text">{error.stack ?? error.message}</pre>
          <Button variant="primary" onClick={() => location.reload()}>
            Reload
          </Button>
        </div>
      </div>
    )
  }
}
