import { useState } from 'react'
import { useConsole } from '../workout/store'
import styles from './PauseBanner.module.css'

/**
 * Explains why the workout is paused or can't start, and what to do next.
 * Hardware state (lanyard, connection) takes priority over the pause reason.
 */
export function PauseBanner() {
  const workout = useConsole((s) => s.workout)
  const treadmill = useConsole((s) => s.treadmill)
  const discardWorkout = useConsole((s) => s.discardWorkout)
  const [confirmDiscard, setConfirmDiscard] = useState(false)

  let tone: 'alert' | 'info' = 'info'
  let message: string | null = null
  let showDiscard = false

  if (treadmill.safetyStop) {
    tone = 'alert'
    message = 'Safety stop. Reattach the lanyard clip before starting the belt again.'
  } else if (treadmill.connection === 'disconnected') {
    tone = 'alert'
    message = workout
      ? 'Lost connection to the treadmill, so the belt is stopping on its own. Your workout is paused and saved.'
      : 'Not connected to the treadmill.'
  } else if (workout?.status === 'paused' && workout.pauseReason === 'recovered') {
    message =
      'Restored the workout that was in progress when the app closed. Resume to keep going, or end it to save it.'
    showDiscard = true
  }

  if (!message) return null

  return (
    <div className={styles.banner} data-tone={tone} role="status">
      <span>{message}</span>
      {showDiscard && (
        <button
          type="button"
          className={styles.discard}
          data-confirm={confirmDiscard}
          onClick={() => (confirmDiscard ? void discardWorkout() : setConfirmDiscard(true))}
        >
          {confirmDiscard ? 'Tap again to discard' : 'Discard it'}
        </button>
      )}
    </div>
  )
}
