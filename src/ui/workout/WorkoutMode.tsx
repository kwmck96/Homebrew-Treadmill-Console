import { useConsole, activeRun, APPLY_FILL_MS } from '../../workout/store'
import { canAddTime, COMPLETE_COUNTDOWN_MS } from '../../workout/runner'
import styles from './WorkoutMode.module.css'

/** Full-screen 5-4-3-2-1 after confirming Start workout. */
export function StartCountdown() {
  const sc = useConsole((s) => s.startCountdown)
  const cancel = useConsole((s) => s.cancelStartCountdown)
  if (!sc) return null
  const secs = Math.ceil(sc.leftMs / 1000)
  return (
    <div className={styles.startLayer} role="alertdialog" aria-label={`${sc.name} starts in ${secs}`}>
      <p className={styles.startName}>{sc.name}</p>
      {secs > 0 ? (
        <span key={secs} className={`${styles.startCount} num`}>
          {secs}
        </span>
      ) : (
        <p className={styles.startWait}>Waiting for the belt to stop…</p>
      )}
      <p className={styles.startNote}>The belt starts at walking speed, then speeds up to the first step.</p>
      <button type="button" className={styles.startCancel} onClick={cancel}>
        Cancel
      </button>
    </div>
  )
}

/** +15s / +30s Recovery: only during recovery and rest steps (greyed otherwise). */
export function AddRecoveryButton({ seconds, className }: { seconds: number; className?: string }) {
  const enabled = useConsole((s) => canAddTime(activeRun(s.workout)) && s.workout?.status === 'running')
  const add = useConsole((s) => s.addRecoveryTime)
  return (
    <button
      type="button"
      className={`${styles.control} ${className ?? ''}`}
      data-kind="recovery"
      disabled={!enabled}
      onClick={() => add(seconds * 1000)}
    >
      <span className={`${styles.controlMain} num`}>+{seconds}s</span>
      <span className={styles.controlSub}>Recovery</span>
    </button>
  )
}

export function SkipStepButton({ className }: { className?: string }) {
  const enabled = useConsole((s) => activeRun(s.workout)?.phase === 'running')
  const skip = useConsole((s) => s.skipStep)
  return (
    <button
      type="button"
      className={`${styles.control} ${className ?? ''}`}
      data-kind="skip"
      disabled={!enabled}
      onClick={skip}
    >
      <span className={styles.controlMain}>Skip This Step</span>
    </button>
  )
}

/**
 * "Apply to all intervals in this step?" after a manual speed or incline
 * change in a rep. No fills over 3 s and is chosen automatically.
 */
export function ApplyPrompt({ className }: { className?: string }) {
  const p = useConsole((s) => s.applyPrompt)
  const answer = useConsole((s) => s.answerApplyPrompt)
  if (!p || p.stage === 'waiting') return null
  if (p.stage === 'flash') {
    return (
      <div className={`${styles.prompt} ${className ?? ''}`} data-flash={p.answer} role="status">
        {p.answer === 'yes' ? 'Applies to the remaining intervals' : 'This interval only'}
      </div>
    )
  }
  return (
    <div className={`${styles.prompt} ${className ?? ''}`} role="alertdialog" aria-label="Apply to all intervals in this step?">
      <span className={styles.promptQuestion}>Apply to all intervals in this step?</span>
      <div className={styles.promptActions}>
        <button type="button" className={styles.promptNo} onClick={() => answer(false)}>
          {/* Restarts whenever askingSince changes (further changes restart the fill). */}
          <span
            key={p.askingSince}
            className={styles.promptFill}
            style={{ animationDuration: `${APPLY_FILL_MS}ms` }}
            aria-hidden="true"
          />
          <span className={styles.promptLabel}>No</span>
        </button>
        <button type="button" className={styles.promptYes} onClick={() => answer(true)}>
          Yes
        </button>
      </div>
    </div>
  )
}

/**
 * After the last step: the belt holds its speed. End fills over 5 s and
 * then ends the workout unless Keep running is tapped.
 */
export function WorkoutCompleteCard() {
  const run = useConsole((s) => s.workout?.run)
  const end = useConsole((s) => s.endWorkout)
  const keep = useConsole((s) => s.keepRunning)
  if (!run || run.phase !== 'complete') return null
  const fill = 1 - run.completeLeftMs / COMPLETE_COUNTDOWN_MS
  return (
    <div className={styles.layer}>
      <section className={styles.card} role="alertdialog" aria-label="Workout complete">
        <h2 className={styles.cardTitle}>Workout complete</h2>
        <p className={styles.cardNote}>
          {run.name} is done. Ending in {Math.ceil(run.completeLeftMs / 1000)} s unless you keep running.
        </p>
        <div className={styles.cardActions}>
          <button type="button" className={styles.end} onClick={() => void end()}>
            <span className={styles.endFill} style={{ width: `${fill * 100}%` }} aria-hidden="true" />
            <span className={styles.promptLabel}>End</span>
          </button>
          <button type="button" className={styles.keep} onClick={keep}>
            Keep running
          </button>
        </div>
      </section>
    </div>
  )
}
