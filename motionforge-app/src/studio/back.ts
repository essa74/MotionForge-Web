import { useEffect, useRef } from 'react'

// Makes the phone/browser back button close the topmost screen instead of leaving the site.
export function useBack(open: boolean, close: () => void) {
  const closeRef = useRef(close)
  closeRef.current = close
  useEffect(() => {
    if (!open) return
    let pushed = false, popped = false
    const onPop = () => { popped = true; closeRef.current() }
    // Delay so a back() queued by a layer that just closed cannot pop this layer's entry.
    const timer = window.setTimeout(() => {
      window.history.pushState({ layer: true }, '')
      pushed = true
      window.addEventListener('popstate', onPop, { once: true })
    }, 80)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('popstate', onPop)
      if (pushed && !popped) window.history.back()
    }
  }, [open])
}
