import { hrCoaching, type HrCoaching } from '../../workout/hrCoach'
import { inHrGrace } from '../../workout/runner'
import { activeRun, useConsole } from '../../workout/store'

/** Coaching for the running step's HR or zone target, or null. */
export function useHrCoaching(): HrCoaching | null {
  const step = useConsole((s) => {
    const run = activeRun(s.workout)
    return run?.phase === 'running' && run.started ? run.steps[run.index] : null
  })
  const bpm = useConsole((s) => s.heartRate.bpm)
  const grace = useConsole((s) => {
    const run = activeRun(s.workout)
    return run ? inHrGrace(run) : false
  })
  return hrCoaching(step, bpm, grace)
}
