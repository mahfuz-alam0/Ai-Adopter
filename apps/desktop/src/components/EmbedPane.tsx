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
  useEffect(() => {
    const d = dialog.current!
    const el = box.current!
    if (!id) return
    d.showModal()
    const put = () => place(id, el.getBoundingClientRect(), window.innerHeight)
    put()
    const ro = new ResizeObserver(put)
    ro.observe(el)
    window.addEventListener('resize', put)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', put)
      unplace(id)
      d.close()
    }
  }, [id])
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
      <div ref={box} className="mx-4 mb-4 min-h-0 flex-1" />
    </dialog>
  )
}
