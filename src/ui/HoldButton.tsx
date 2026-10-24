import { type ButtonHTMLAttributes, type ReactNode, useEffect, useLayoutEffect, useRef } from 'react'

const INITIAL_DELAY_MS = 450
const REPEAT_MS = 140

interface HoldButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onClick'> {
  /** Fired once on press, then repeatedly while held (M4 hold-to-repeat). */
  onTrigger: () => void
  children: ReactNode
}

/**
 * A button that fires immediately on touch-down (no 300 ms click delay) and
 * keeps firing while held. Uses pointer events so it works the same with a
 * finger, mouse, or stylus.
 */
export function HoldButton({ onTrigger, disabled, children, ...rest }: HoldButtonProps) {
  const delayRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const repeatRef = useRef<ReturnType<typeof setInterval> | null>(null)
  // Always call the latest handler, even from a timer set on an earlier render.
  const triggerRef = useRef(onTrigger)
  useLayoutEffect(() => {
    triggerRef.current = onTrigger
  })

  const stop = () => {
    if (delayRef.current) clearTimeout(delayRef.current)
    if (repeatRef.current) clearInterval(repeatRef.current)
    delayRef.current = null
    repeatRef.current = null
  }

  useEffect(() => stop, [])
  useEffect(() => {
    if (disabled) stop()
  }, [disabled])

  return (
    <button
      type="button"
      {...rest}
      disabled={disabled}
      onPointerDown={(e) => {
        if (disabled || e.button !== 0) return
        try {
          // Keep receiving pointerup even if the finger slides off the button.
          e.currentTarget.setPointerCapture(e.pointerId)
        } catch {
          // Synthetic or already-released pointers can't be captured; the
          // button still works, it just won't track a finger sliding off.
        }
        triggerRef.current()
        stop()
        delayRef.current = setTimeout(() => {
          repeatRef.current = setInterval(() => triggerRef.current(), REPEAT_MS)
        }, INITIAL_DELAY_MS)
      }}
      onPointerUp={stop}
      onPointerCancel={stop}
      onLostPointerCapture={stop}
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={(e) => {
        // Keyboard users (and the dev's laptop) get a single step per keypress.
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          if (!disabled) triggerRef.current()
        }
      }}
    >
      {children}
    </button>
  )
}
