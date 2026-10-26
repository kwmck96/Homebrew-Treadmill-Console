import { useEffect, useRef, useState } from 'react'
import { type DistanceUnit, formatPace, formatSpeed, paceUnitLabel } from '../../lib/units'
import styles from './PresetHoldButton.module.css'

/** How long to hold before the preset is overwritten. */
export const HOLD_TO_SET_MS = 700
/** How long the "Saved" confirmation stays up. */
const SAVED_FLASH_MS = 1400

interface PresetHoldButtonProps {
  label: string
  valueMph: number
  unit: DistanceUnit
  /** Tap: jump to this preset. Only possible while the belt is running. */
  onTap: () => void
  canTap: boolean
  /** Hold: overwrite the preset with the wheel's value. Works any time. */
  onHold: () => void
}

/**
 * Tap to go to the preset; hold to save the wheel's speed into it. The tap
 * fires on release (unlike the step buttons) so it can be told apart from a
 * hold. A bar fills along the bottom while holding.
 */
export function PresetHoldButton(props: PresetHoldButtonProps) {
  const [holding, setHolding] = useState(false)
  const [saved, setSaved] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const held = useRef(false)

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

  return (
    <button
      type="button"
      className={styles.button}
      data-holding={holding}
      data-saved={saved}
      data-can-tap={props.canTap}
      aria-label={`${props.label}, ${formatSpeed(props.valueMph, props.unit)}. Tap to go, hold to set to the wheel's speed.`}
      onPointerDown={(e) => {
        if (e.button !== 0) return
        held.current = false
        setHolding(true)
        timer.current = setTimeout(() => {
          held.current = true
          setHolding(false)
          setSaved(true)
          props.onHold()
        }, HOLD_TO_SET_MS)
      }}
      onPointerUp={() => {
        const wasHold = held.current
        const pending = timer.current != null
        clear()
        if (!wasHold && pending && props.canTap) props.onTap()
      }}
      // Sliding off the button cancels both tap and hold.
      onPointerLeave={clear}
      onPointerCancel={clear}
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={(e) => {
        if ((e.key === 'Enter' || e.key === ' ') && props.canTap) {
          e.preventDefault()
          props.onTap()
        }
      }}
    >
      <span className={styles.label}>{saved ? 'Saved' : props.label}</span>
      <span className={`${styles.value} num`}>{formatSpeed(props.valueMph, props.unit)}</span>
      <span className={`${styles.pace} num`}>
        {formatPace(props.valueMph, props.unit)}
        {paceUnitLabel(props.unit)}
      </span>
      <span className={styles.help}>hold to set</span>
      <span className={styles.progress} aria-hidden="true" />
    </button>
  )
}
