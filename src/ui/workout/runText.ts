/** Wording for the workout banner, controls and summary. */
import { type DistanceUnit, formatDistance, formatDuration, formatPace, paceUnitLabel } from '../../lib/units'
import type { PlannedStep } from '../../plan/expand'
import { formatDurationSpec } from '../../plan/format'
import { type PlanRun, stepRemaining } from '../../workout/runner'

/** "6:00/mi · 4 %", "140–152 bpm", "Effort 7", "Rest off treadmill". */
export function describeStepTarget(step: PlannedStep, unit: DistanceUnit): string {
  const parts: string[] = []
  if (step.kind === 'rest') {
    parts.push(step.restOff ? 'Off treadmill' : `Walk ${step.speedMph.toFixed(1)} mph`)
  } else if (step.targetKind === 'pace') {
    parts.push(`${formatPace(step.speedMph, unit)}${paceUnitLabel(unit)}`)
  }
  if (step.targetKind === 'hr' || step.targetKind === 'zone') {
    parts.push(`${step.hrRange?.low}–${step.hrRange?.high} bpm`)
  } else if (step.targetKind === 'rpe') {
    parts.push(`Effort ${step.rpe}`)
  }
  if ((step.targetKind === 'hr' || step.targetKind === 'zone' || step.targetKind === 'rpe') && step.kind !== 'rest') {
    parts.push(`from ${formatPace(step.speedMph, unit)}${paceUnitLabel(unit)}`)
  }
  if (step.inclinePct !== 0 && !step.restOff) parts.push(`${step.inclinePct} %`)
  return parts.join(' · ')
}

/** "1:42 left", "0.18 mi left". */
export function remainingText(run: PlanRun, unit: DistanceUnit): string {
  const left = stepRemaining(run)
  if ('ms' in left) return `${formatDuration(Math.ceil(left.ms / 1000) * 1000)} left`
  const plus = left.extraMs > 0 ? ` + ${formatDuration(left.extraMs)}` : ''
  return `${formatDistance(left.m, unit)} ${unit} left${plus}`
}

/** "Recovery 1:30". */
export function nextText(run: PlanRun, unit: DistanceUnit): string | null {
  const next = run.steps[run.index + 1]
  if (!next) return null
  return `${next.label} ${formatDurationSpec(next.duration, unit)}`
}

/** What the runner is doing right now, when it isn't simply running the step. */
export function holdText(run: PlanRun): string | null {
  if (run.phase === 'complete') return 'Workout complete'
  if (run.hold?.kind === 'countdown') {
    return run.hold.leftMs > 0 ? `Resuming in ${Math.ceil(run.hold.leftMs / 1000)}` : 'Starting'
  }
  if (run.hold?.kind === 'reaching') return 'Getting up to speed'
  if (run.preRamp) {
    const next = run.steps[run.index + 1]
    return next ? `Speeding up for ${next.label}` : null
  }
  return null
}
