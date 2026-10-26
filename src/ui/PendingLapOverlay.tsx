import type { CSSProperties } from 'react'
import { formatSpeed, speedUnitLabel } from '../lib/units'
import { useSettings } from '../settings/store'
import { currentLap } from '../workout/engine'
import { LAP_COUNTDOWN_MS, rampProgress } from '../workout/pendingLap'
import { useConsole } from '../workout/store'
import styles from './PendingLapOverlay.module.css'

/**
 * Shown while a preset-triggered lap waits for the belt and deck to reach
 * the new targets, then counts down 3-2-1. Each view places it over its
 * centre area (data fields or chart), so it never covers Stop belt, Pause,
 * the presets or the speed/incline controls.
 */
export function PendingLapOverlay() {
  const pending = useConsole((s) => s.pendingLap)
  const nextLap = useConsole((s) => (s.workout ? currentLap(s.workout).index + 1 : 1))
  const cancel = useConsole((s) => s.cancelPendingLap)
  const unit = useSettings((s) => s.distanceUnit)
  if (!pending) return null

  const counting = pending.phase === 'countdown'
  const secondsLeft = Math.max(1, Math.ceil(pending.countdownLeftMs / 1000))
  // Speed rather than pace, even in pace mode: pace isn't linear in speed, so
  // a climbing pace (60:00 → 14:58 → 5:27) reads badly as a ramp.
  const speedText = (mph: number) => formatSpeed(mph, unit)

  return (
    <div className={styles.layer}>
      <section
        className={styles.card}
        data-phase={pending.phase}
        role="status"
        aria-live="polite"
        aria-label={counting ? `Lap ${nextLap} starts in ${secondsLeft}` : `Lap ${nextLap} waiting for speed`}
      >
        <div className={styles.top}>
          <div>
            <h2 className={styles.heading}>
              {counting ? `Lap ${nextLap} starts in` : `Lap ${nextLap} starts once you're up to speed`}
            </h2>
            <p className={styles.note}>Estimated from typical ramp rates</p>
          </div>
          {counting && (
            <span key={secondsLeft} className={`${styles.count} num`}>
              {secondsLeft}
            </span>
          )}
        </div>

        <RampRow
          label="Speed"
          accent="speed"
          now={speedText(pending.estSpeedMph)}
          target={speedText(pending.targetSpeedMph)}
          unit={speedUnitLabel(unit)}
          progress={rampProgress(pending.fromSpeedMph, pending.estSpeedMph, pending.targetSpeedMph)}
        />
        <RampRow
          label="Incline"
          accent="grade"
          now={pending.estInclinePct.toFixed(1)}
          target={pending.targetInclinePct.toFixed(1)}
          unit="%"
          progress={rampProgress(
            pending.fromInclinePct,
            pending.estInclinePct,
            pending.targetInclinePct,
          )}
        />

        {counting && (
          <span className={styles.countdownTrack} aria-hidden="true">
            <span
              className={styles.countdownFill}
              style={{ width: `${(pending.countdownLeftMs / LAP_COUNTDOWN_MS) * 100}%` }}
            />
          </span>
        )}

        <button type="button" className={styles.cancel} onClick={cancel}>
          Do not start new lap
        </button>
      </section>
    </div>
  )
}

function RampRow(props: {
  label: string
  accent: 'speed' | 'grade'
  now: string
  target: string
  unit: string
  progress: number
}) {
  const done = props.progress >= 1
  return (
    <div
      className={styles.row}
      style={{ '--accent': `var(--${props.accent})` } as CSSProperties}
      data-done={done}
    >
      <span className={styles.rowLabel}>{props.label}</span>
      <span className={`${styles.rowValues} num`}>
        <span className={styles.now}>{props.now}</span>
        {!done && <span className={styles.arrow}> → {props.target}</span>}
        <span className={styles.rowUnit}> {props.unit}</span>
      </span>
      <span className={styles.bar} aria-hidden="true">
        <span className={styles.fill} style={{ width: `${props.progress * 100}%` }} />
      </span>
    </div>
  )
}
