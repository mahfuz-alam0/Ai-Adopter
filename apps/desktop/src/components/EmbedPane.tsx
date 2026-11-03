import { useEffect, useRef } from 'react'
import { useHub } from '../state/HubContext.tsx'
import { Button } from './Button.tsx'

// Modal for the lane page shown inside the app (a login). The page is a native webview that Rust puts over the
// empty box below, so this only measures the box and keeps the page in step when it moves or resizes.
export function EmbedPane() {
  const { shown, place, unplace } = useHub()
  const dialog = useRef<HTMLDialogElement>(null)
  const box = useRef<HTMLDivElement>(null)
  const id = shown?.id
  // The modal opens at once; the page goes over it only once it has rendered.
  const live = shown && !shown.loading ? id : undefined
  useEffect(() => {
    const d = dialog.current!
    if (!id) return
    d.showModal()
    return () => d.close()
  }, [id])
  useEffect(() => {
    const el = box.current!
    if (!live) return
    const put = () => place(live, el.getBoundingClientRect(), window.innerHeight)
    put()
    const ro = new ResizeObserver(put)
    ro.observe(el)
    window.addEventListener('resize', put)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', put)
      unplace(live)
    }
  }, [live])
  return (
    <dialog
      ref={dialog}
      // Escape does what Done does: the check still runs and the lane closes properly.
      onCancel={(e) => {
        e.preventDefault()
        shown?.done()
      }}
      className="m-auto h-[min(720px,90vh)] w-[min(980px,92vw)] flex-col rounded-2xl border border-line2 bg-panel text-fg shadow-lift open:flex backdrop:bg-black/50 backdrop:backdrop-blur-md"
    >
      <div className="flex items-center justify-between gap-4 px-4 py-3">
        <h2 className="text-[15px] font-semibold">{shown?.title}</h2>
        <Button variant="primary" size="sm" onClick={shown?.done}>
          Done
        </Button>
      </div>
      <div ref={box} className="mx-4 mb-4 grid min-h-0 flex-1 place-items-center font-mono text-xs text-muted">
        {shown?.loading && '> loading page'}
      </div>
    </dialog>
  )
}
