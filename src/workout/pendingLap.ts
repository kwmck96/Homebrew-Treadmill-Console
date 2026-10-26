/**
 * A lap triggered by a preset tap waits for the belt and deck to reach the
 * new targets, then counts down before splitting, so the new lap starts at
 * the new effort instead of during the ramp.
 *
 * The belt's position during the ramp is estimated from RAMP_RATES rather
 * than read from the hardware, which may not report it. Pure functions; the
 * console store calls them on each tick.
 */
import { RAMP_RATES } from '../treadmill/rampRates'

/** Seconds counted down once the targets are reached. */
export const LAP_COUNTDOWN_MS = 3000

export interface PendingLap {
  phase: 'ramping' | 'countdown'
  /** Where we think the belt and deck are right now. */
  estSpeedMph: number
  estInclinePct: number
  targetSpeedMph: number
  targetInclinePct: number
  /** Values when the ramp (re)started, for progress bars. */
  fromSpeedMph: number
  fromInclinePct: number
  /** Real-time ms left in the countdown phase. */
  countdownLeftMs: number
  /**
   * The treadmill's targets as last seen. Only a change from these counts as
   * the user moving the target (wheel, steps); a driver that confirms a new
   * command a tick late doesn't trigger a re-target.
   */
  seenSpeedMph: number
  seenInclinePct: number
}

export interface Targets {
  speedMph: number
  inclinePct: number
}

/**
 * Start a pending lap, or re-target one that's already pending (taps don't
 * stack: one ramp, one countdown, one lap).
 */
export function startPendingLap(
  existing: PendingLap | null,
  current: Targets,
  targets: Targets,
  /** Treadmill targets before the preset command was sent. */
  seen: Targets = targets,
): PendingLap {
  const from = existing
    ? { speedMph: existing.estSpeedMph, inclinePct: existing.estInclinePct }
    : current
  return {
    phase: 'ramping',
    estSpeedMph: from.speedMph,
    estInclinePct: from.inclinePct,
    targetSpeedMph: targets.speedMph,
    targetInclinePct: targets.inclinePct,
    fromSpeedMph: from.speedMph,
    fromInclinePct: from.inclinePct,
    countdownLeftMs: LAP_COUNTDOWN_MS,
    seenSpeedMph: seen.speedMph,
    seenInclinePct: seen.inclinePct,
  }
}

/**
 * Advance the estimate.
 * @param targets the treadmill's current targets, so wheel/step changes made
 *   during the ramp are followed.
 * @param rampDtMs time for the ramp estimate (simulation time).
 * @param realDtMs time for the countdown (always real seconds, so it's
 *   readable even with the simulator sped up).
 * @returns the updated pending lap and whether to split the lap now.
 */
export function advancePendingLap(
  p: PendingLap,
  targets: Targets,
  rampDtMs: number,
  realDtMs: number,
  rates: { speedMphPerSec: number; inclinePctPerSec: number } = RAMP_RATES,
): { pending: PendingLap | null; fireLap: boolean } {
  let next = p
  const targetsChanged = targets.speedMph !== p.seenSpeedMph || targets.inclinePct !== p.seenInclinePct
  if (targetsChanged) {
    next = { ...next, seenSpeedMph: targets.speedMph, seenInclinePct: targets.inclinePct }
    if (targets.speedMph !== p.targetSpeedMph || targets.inclinePct !== p.targetInclinePct) {
      // Targets moved (wheel, steps): ramp again from where we think we are.
      next = {
        ...next,
        phase: 'ramping',
        targetSpeedMph: targets.speedMph,
        targetInclinePct: targets.inclinePct,
        fromSpeedMph: p.estSpeedMph,
        fromInclinePct: p.estInclinePct,
        countdownLeftMs: LAP_COUNTDOWN_MS,
      }
    }
  }

  const dt = rampDtMs / 1000
  const estSpeedMph = approach(next.estSpeedMph, next.targetSpeedMph, rates.speedMphPerSec * dt)
  const estInclinePct = approach(next.estInclinePct, next.targetInclinePct, rates.inclinePctPerSec * dt)
  const reached = estSpeedMph === next.targetSpeedMph && estInclinePct === next.targetInclinePct

  if (!reached) {
    return { pending: { ...next, phase: 'ramping', estSpeedMph, estInclinePct }, fireLap: false }
  }
  if (next.phase === 'ramping') {
    // Just arrived: the countdown starts now.
    return {
      pending: { ...next, phase: 'countdown', estSpeedMph, estInclinePct, countdownLeftMs: LAP_COUNTDOWN_MS },
      fireLap: false,
    }
  }
  const left = next.countdownLeftMs - realDtMs
  if (left <= 0) return { pending: null, fireLap: true }
  return { pending: { ...next, estSpeedMph, estInclinePct, countdownLeftMs: left }, fireLap: false }
}

/** 0–1 progress of one quantity from its ramp start to its target. */
export function rampProgress(from: number, est: number, target: number): number {
  if (from === target) return 1
  return Math.min(1, Math.max(0, (est - from) / (target - from)))
}

function approach(current: number, target: number, maxDelta: number): number {
  if (current < target) return Math.min(target, current + maxDelta)
  if (current > target) return Math.max(target, current - maxDelta)
  return current
}
