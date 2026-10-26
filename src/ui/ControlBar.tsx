import { useEffect, useState } from 'react'
import { useConsole } from '../workout/store'
import styles from './ControlBar.module.css'

/** How long "End workout" waits for the confirming second tap. */
const CONFIRM_WINDOW_MS = 3000

export function ControlBar() {
  const workout = useConsole((s) => s.workout)
  const treadmill = useConsole((s) => s.treadmill)
  const { startWorkout, pauseWorkout, resumeWorkout, endWorkout, lap } = useConsole.getState()
  const [confirmEnd, setConfirmEnd] = useState(false)

  useEffect(() => {
    if (!confirmEnd) return
    const id = setTimeout(() => setConfirmEnd(false), CONFIRM_WINDOW_MS)
    return () => clearTimeout(id)
  }, [confirmEnd])

  const ready = treadmill.connection === 'connected' && !treadmill.safetyStop

  if (!workout) {
    return (
      <div className={styles.bar}>
        <button
          type="button"
          className={styles.primary}
          data-tone="go"
          disabled={!ready}
          onClick={() => void startWorkout()}
        >
          Start
        </button>
      </div>
    )
  }

  if (workout.status === 'running') {
    return (
      <div className={styles.bar}>
        <button type="button" className={styles.primary} onClick={() => void pauseWorkout()}>
          Pause
        </button>
        <button type="button" className={styles.secondary} onClick={() => lap()}>
          Lap
        </button>
      </div>
    )
  }

  // Paused. Resume waits for the belt to reach a full stop so it always
  // restarts from rest at walking speed.
  const beltSettling = treadmill.belt !== 'stopped'
  return (
    <div className={styles.bar}>
      <button
        type="button"
        className={styles.primary}
        data-tone="go"
        disabled={!ready || beltSettling}
        onClick={() => void resumeWorkout()}
      >
        {beltSettling && ready ? 'Belt stopping…' : 'Resume'}
      </button>
      <button
        type="button"
        className={styles.secondary}
        data-tone={confirmEnd ? 'danger' : undefined}
        onClick={() => {
          if (confirmEnd) void endWorkout()
          else setConfirmEnd(true)
        }}
      >
        {confirmEnd ? 'Tap again to end' : 'End workout'}
      </button>
    </div>
  )
}
