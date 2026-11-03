import { useEffect, useRef } from 'react'
import { useHub } from '../state/HubContext.tsx'
import { Button } from './Button.tsx'

// Frame for the lane page shown inside the app (a login). The page is a native webview that Rust puts over the
// empty box below, so this only measures the box and keeps the page in step when it moves or resizes.
export function EmbedPane() {
  const { shown, place, unplace } = useHub()
  const box = useRef<HTMLDivElement>(null)
  const id = shown?.id
  useEffect(() => {
    const el = box.current
    if (!id || !el) return
    const put = () => place(id, el.getBoundingClientRect())
    put()
    const ro = new ResizeObserver(put)
    ro.observe(el)
    window.addEventListener('resize', put)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', put)
      unplace(id)
    }
  }, [id])
  if (!shown) return null
  return (
    <div className="absolute inset-0 z-10 flex flex-col bg-bg">
      <div className="flex items-center justify-between gap-4 border-b border-line px-7 py-2.5">
        <h2 className="text-[15px] font-semibold">{shown.title}</h2>
        <Button variant="primary" size="sm" onClick={shown.done}>
          Done
        </Button>
      </div>
      <div ref={box} className="min-h-0 flex-1" />
    </div>
  )
}
