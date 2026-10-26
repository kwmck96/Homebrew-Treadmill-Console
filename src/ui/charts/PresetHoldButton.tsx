import { type DistanceUnit, formatPace, formatSpeed, paceUnitLabel } from '../../lib/units'
import { useTapOrHold } from '../useTapOrHold'
import styles from './PresetHoldButton.module.css'

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

/** Charts view Run / Recover: tap to go, hold to save the wheel's speed. */
export function PresetHoldButton(props: PresetHoldButtonProps) {
  const { holding, saved, handlers } = useTapOrHold(props)

  return (
    <button
      type="button"
      className={styles.button}
      data-holding={holding}
      data-saved={saved}
      data-can-tap={props.canTap}
      aria-label={`${props.label}, ${formatSpeed(props.valueMph, props.unit)}. Tap to go, hold to set to the wheel's speed.`}
      {...handlers}
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
