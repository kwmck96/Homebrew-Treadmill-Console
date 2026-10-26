/**
 * Estimated time, distance and elevation for steps, blocks and the whole
 * workout. Belt ramps are ignored (they fall inside recoveries).
 *
 * A value is unknown when the speed isn't fixed: HR, zone and effort steps
 * run at whatever speed you end up at, so a time-based HR step has no
 * distance estimate and a distance-based one has no time estimate. Totals add
 * up what's known and count what isn't.
 */
import type { PlannedStep } from './expand'

export interface Estimate {
  /** Sum of known times, seconds. */
  timeSec: number
  /** Steps whose time couldn't be estimated. */
  unknownTime: number
  /** Time includes HR-advance rests counted at their maximum. */
  timeIsMax: boolean
  distanceM: number
  unknownDistance: number
  elevGainM: number
  elevLossM: number
  unknownElevation: number
  /** Any step with a non-zero incline (elevation is only shown if so). */
  hasIncline: boolean
}

const EMPTY: Estimate = {
  timeSec: 0,
  unknownTime: 0,
  timeIsMax: false,
  distanceM: 0,
  unknownDistance: 0,
  elevGainM: 0,
  elevLossM: 0,
  unknownElevation: 0,
  hasIncline: false,
}

/** Speed in m/s if this step runs at a known speed, else null. */
function knownSpeed(s: PlannedStep): number | null {
  if (s.kind === 'rest') return s.restOff ? 0 : (s.speedMph * 1609.344) / 3600
  if (s.targetKind === 'pace') return (s.speedMph * 1609.344) / 3600
  return null
}

export function estimateStep(s: PlannedStep): Estimate {
  const e = { ...EMPTY, hasIncline: s.inclinePct !== 0 && !s.restOff }
  const v = knownSpeed(s)
  let time: number | null = null
  let dist: number | null = null
  if (s.duration.kind === 'time') {
    time = s.duration.seconds
    dist = v == null ? null : v * time
  } else {
    dist = s.duration.meters
    time = v == null ? null : v > 0 ? dist / v : null
  }
  if (s.restOff) dist = 0

  if (time == null) e.unknownTime = 1
  else e.timeSec = time
  e.timeIsMax = s.advanceAtHr != null

  if (dist == null) {
    e.unknownDistance = 1
    if (e.hasIncline) e.unknownElevation = 1
  } else {
    e.distanceM = dist
    // Grade is rise over run; belt distance is along the deck surface.
    const g = s.inclinePct / 100
    const vertical = (dist * g) / Math.sqrt(1 + g * g)
    if (vertical > 0) e.elevGainM = vertical
    else e.elevLossM = -vertical
  }
  return e
}

export function sumEstimates(list: Estimate[]): Estimate {
  return list.reduce(
    (a, b) => ({
      timeSec: a.timeSec + b.timeSec,
      unknownTime: a.unknownTime + b.unknownTime,
      timeIsMax: a.timeIsMax || b.timeIsMax,
      distanceM: a.distanceM + b.distanceM,
      unknownDistance: a.unknownDistance + b.unknownDistance,
      elevGainM: a.elevGainM + b.elevGainM,
      elevLossM: a.elevLossM + b.elevLossM,
      unknownElevation: a.unknownElevation + b.unknownElevation,
      hasIncline: a.hasIncline || b.hasIncline,
    }),
    EMPTY,
  )
}

export function estimateSteps(steps: PlannedStep[]): Estimate {
  return sumEstimates(steps.map(estimateStep))
}

/** Per-block estimates, keyed by block id. */
export function estimateByBlock(steps: PlannedStep[]): Map<string, Estimate> {
  const groups = new Map<string, Estimate[]>()
  for (const s of steps) {
    const list = groups.get(s.blockId) ?? []
    list.push(estimateStep(s))
    groups.set(s.blockId, list)
  }
  return new Map([...groups].map(([id, list]) => [id, sumEstimates(list)]))
}
