import { useEffect, useRef, useState } from 'react'

/** How long to hold before the hold action fires. */
export const HOLD_MS = 700
/** How long the "Saved" confirmation stays up after a hold. */
const SAVED_FLASH_MS = 1400

/**
 * Tap vs hold for preset buttons. The tap fires on release (so it can be told
 * apart from a hold); the hold fires after HOLD_MS. Sliding off the button
 * cancels both. Used on both the Control Center and Charts presets.
 */
export function useTapOrHold(options: { onTap: () => void; onHold: () => void; canTap: boolean }) {
  const [holding, setHolding] = useState(false)
  const [saved, setSaved] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const held = useRef(false)
  // Timers fire after a re-render; always call the latest callbacks.
  const latest = useRef(options)
  useEffect(() => {
    latest.current = options
  })

  const clear = () => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    setHolding(false)
  }
  useEffect(() => clear, [])

  useEffect(() => {
    if (!saved) return
    const id = setTimeout(() => setSaved(false), SAVED_FLASH_MS)
    return () => clearTimeout(id)
  }, [saved])

  const handlers = {
    onPointerDown: (e: React.PointerEvent) => {
      if (e.button !== 0) return
      held.current = false
      setHolding(true)
      timer.current = setTimeout(() => {
        held.current = true
        timer.current = null
        setHolding(false)
        setSaved(true)
        latest.current.onHold()
      }, HOLD_MS)
    },
    onPointerUp: () => {
      const wasTap = !held.current && timer.current != null
      clear()
      if (wasTap && latest.current.canTap) latest.current.onTap()
    },
    onPointerLeave: clear,
    onPointerCancel: clear,
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
    onKeyDown: (e: React.KeyboardEvent) => {
      if ((e.key === 'Enter' || e.key === ' ') && latest.current.canTap) {
        e.preventDefault()
        latest.current.onTap()
      }
    },
  }

  return { holding, saved, handlers }
}
