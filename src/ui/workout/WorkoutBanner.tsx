import { useState } from 'react'
import { useSettings } from '../../settings/store'
import { stepNeedsHr } from '../../workout/hrCoach'
import { stepProgress } from '../../workout/runner'
import { activeRun, useConsole } from '../../workout/store'
import { describeStepTarget, holdText, nextText, remainingText } from './runText'
import styles from './WorkoutBanner.module.css'
import { useHrCoaching } from './useHrCoaching'
import { WorkoutSheet } from './WorkoutSheet'

/**
 * "Workout Mode: Interval 2 of 4 · 1:42 left · Next: Recovery 1:30", on both
 * views. Tap to see the whole workout and edit what's left of it.
 */
export function WorkoutBanner({ compact = false }: { compact?: boolean }) {
  const run = useConsole((s) => activeRun(s.workout))
  const paused = useConsole((s) => s.workout?.status === 'paused')
  const unit = useSettings((s) => s.distanceUnit)
  const bpm = useConsole((s) => s.heartRate.bpm)
  const coaching = useHrCoaching()
  const [open, setOpen] = useState(false)
  if (!run) return null

  const step = run.phase === 'running' ? run.steps[run.index] : null
  const hold = holdText(run)
  const next = step ? nextText(run, unit) : null

  return (
    <>
      <button
        type="button"
        className={styles.banner}
        data-phase={run.phase}
        data-kind={step?.on ? 'on' : 'off'}
        data-compact={compact}
        onClick={() => setOpen(true)}
        aria-label="Workout: show and edit all steps"
      >
        <span className={styles.mode}>Workout Mode</span>
        <span className={styles.text}>
          {step ? (
            <>
              <strong>{step.label}</strong>
              {!hold && <span className="num"> · {remainingText(run, unit)}</span>}
            </>
          ) : (
            <strong>{run.name}</strong>
          )}
        </span>
        {next && <span className={styles.next}>{compact ? '' : '· '}Next: {next}</span>}
        {(hold || paused) && <span className={styles.hold}>{paused ? 'Paused' : hold}</span>}
        {step && stepNeedsHr(step) && bpm == null ? (
          <span className={styles.warn}>
            {step.advanceAtHr != null ? 'No heart rate: full rest' : 'No heart rate'}
          </span>
        ) : (
          coaching && (
            <span className={`${styles.coach} num`} style={{ background: coaching.color }}>
              {bpm} bpm · {coaching.label}
            </span>
          )
        )}
        {step && <span className={`${styles.target} num`}>{describeStepTarget(step, unit)}</span>}
        <span className={styles.edit} aria-hidden="true">
          All steps ›
        </span>
        {step && (
          <span className={styles.progress} aria-hidden="true">
            <span style={{ width: `${stepProgress(run) * 100}%` }} />
          </span>
        )}
      </button>
      {open && <WorkoutSheet onClose={() => setOpen(false)} />}
    </>
  )
}
