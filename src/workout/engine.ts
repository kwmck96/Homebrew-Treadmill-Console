/**
 * Pure workout math. No timers, no React, no storage: every function takes a
 * record and returns a new one, which keeps this easy to unit-test.
 */
import { mphToMetersPerSec } from '../lib/units'
import type { Lap, PauseReason, WorkoutRecord } from './types'

/** Record one sample per second of moving time. */
export const SAMPLE_INTERVAL_MS = 1000

/**
 * Longest time step we'll integrate in one go. If the app is suspended (screen
 * off, tab hidden) the next tick could be minutes later; integrating that gap
 * at the last known speed would invent distance. Gaps are capped instead.
 */
export const MAX_STEP_MS = 2000

export interface TreadmillReading {
  actualSpeedMph: number
  actualInclinePct: number
  /** Only integrate distance while we can actually see the treadmill. */
  connected: boolean
  /** Latest heart rate, or null with no strap. */
  heartRateBpm?: number | null
}

export function newWorkoutId(nowEpoch: number): string {
  const rand = Math.random().toString(36).slice(2, 8)
  return `w-${nowEpoch}-${rand}`
}

export function createWorkout(nowEpoch: number, id = newWorkoutId(nowEpoch)): WorkoutRecord {
  return {
    schemaVersion: 1,
    id,
    startedAt: nowEpoch,
    updatedAt: nowEpoch,
    status: 'running',
    elapsedMs: 0,
    distanceM: 0,
    elevGainM: 0,
    elevLossM: 0,
    laps: [openLap(1, 'start', 0, 0, 0, 0)],
    samples: [],
  }
}

/**
 * Advance the workout by `dtMs` given the treadmill's actual speed/incline.
 *
 * Distance and elevation accrue whenever the belt is moving and visible, even
 * while paused (the belt is still decelerating and you're still on it).
 * Elapsed time accrues only while running.
 */
export function advance(
  record: WorkoutRecord,
  reading: TreadmillReading,
  dtMs: number,
  nowEpoch: number,
): WorkoutRecord {
  if (record.status === 'finished' || dtMs <= 0) return record
  const dt = Math.min(dtMs, MAX_STEP_MS)

  let { distanceM, elevGainM, elevLossM, elapsedMs, samples } = record

  if (reading.connected && reading.actualSpeedMph > 0) {
    const meters = mphToMetersPerSec(reading.actualSpeedMph) * (dt / 1000)
    distanceM += meters
    // Incline % is grade (rise/run). Belt distance is measured along the deck
    // surface, so vertical gain = distance × sin(atan(grade)).
    const grade = reading.actualInclinePct / 100
    const vertical = (meters * grade) / Math.sqrt(1 + grade * grade)
    if (vertical > 0) elevGainM += vertical
    else elevLossM -= vertical
  }

  if (record.status === 'running') {
    const before = elapsedMs
    elapsedMs += dt
    // Add a sample each time we cross a whole sampling interval.
    if (Math.floor(elapsedMs / SAMPLE_INTERVAL_MS) > Math.floor(before / SAMPLE_INTERVAL_MS)) {
      samples = [
        ...samples,
        {
          t: elapsedMs,
          speedMph: round(reading.actualSpeedMph, 2),
          inclinePct: round(reading.actualInclinePct, 2),
          distanceM: round(distanceM, 2),
          ...(reading.heartRateBpm != null ? { hr: Math.round(reading.heartRateBpm) } : {}),
        },
      ]
    }
  }

  return { ...record, distanceM, elevGainM, elevLossM, elapsedMs, samples, updatedAt: nowEpoch }
}

export function pause(record: WorkoutRecord, reason: PauseReason, nowEpoch: number): WorkoutRecord {
  if (record.status !== 'running') {
    // Already paused: keep the more informative reason (e.g. a safety stop
    // shouldn't be relabelled as a user pause).
    if (record.status === 'paused' && record.pauseReason === 'user' && reason !== 'user') {
      return { ...record, pauseReason: reason, updatedAt: nowEpoch }
    }
    return record
  }
  return { ...record, status: 'paused', pauseReason: reason, updatedAt: nowEpoch }
}

export function resume(record: WorkoutRecord, nowEpoch: number): WorkoutRecord {
  if (record.status !== 'paused') return record
  return { ...record, status: 'running', pauseReason: undefined, updatedAt: nowEpoch }
}

/** Close the current lap and open a new one (M6). */
export function addLap(
  record: WorkoutRecord,
  nowEpoch: number,
  trigger: Lap['trigger'] = 'manual',
): WorkoutRecord {
  if (record.status === 'finished') return record
  const laps = closeCurrentLap(record)
  laps.push(
    openLap(
      laps.length + 1,
      trigger,
      record.elapsedMs,
      record.distanceM,
      record.elevGainM,
      record.elevLossM,
    ),
  )
  return { ...record, laps, updatedAt: nowEpoch }
}

/**
 * Auto-lap: split every `lapM` metres of lap distance. `prev` and `next` are
 * the record before and after one `advance` step; the split is placed at the
 * exact crossing by interpolating between them, so a 1 mi lap is 1.00 mi
 * whatever the tick size. Counts from the start of the current lap, so a
 * manual split restarts the count. Several crossings in one step all split.
 */
export function autoLap(
  prev: WorkoutRecord,
  next: WorkoutRecord,
  lapM: number,
  nowEpoch: number,
): WorkoutRecord {
  if (next.status === 'finished' || !(lapM > 0)) return next
  let rec = next
  // A bounded loop: one split per lap distance covered in this step.
  for (let guard = 0; guard < 100; guard++) {
    const lap = currentLap(rec)
    const target = lap.startDistanceM + lapM
    if (rec.distanceM < target) return rec
    const span = next.distanceM - prev.distanceM
    // Already past the mark before this step (e.g. lap distance shortened
    // mid-lap): split now.
    const f = span > 0 && prev.distanceM < target ? (target - prev.distanceM) / span : 1
    const at = (a: number, b: number) => a + (b - a) * f
    const point = {
      ...rec,
      elapsedMs: at(prev.elapsedMs, next.elapsedMs),
      distanceM: f === 1 ? next.distanceM : target,
      elevGainM: at(prev.elevGainM, next.elevGainM),
      elevLossM: at(prev.elevLossM, next.elevLossM),
    }
    const laps = closeCurrentLap(point)
    laps.push(
      openLap(laps.length + 1, 'auto', point.elapsedMs, point.distanceM, point.elevGainM, point.elevLossM),
    )
    rec = { ...rec, laps, updatedAt: nowEpoch }
  }
  return rec
}

export function finish(record: WorkoutRecord, nowEpoch: number): WorkoutRecord {
  if (record.status === 'finished') return record
  return {
    ...record,
    laps: closeCurrentLap(record),
    status: 'finished',
    pauseReason: undefined,
    endedAt: nowEpoch,
    updatedAt: nowEpoch,
  }
}

export function currentLap(record: WorkoutRecord): Lap {
  return record.laps[record.laps.length - 1]
}

/** Totals for a lap; works for both closed laps and the open one. */
export function lapTotals(record: WorkoutRecord, lap: Lap) {
  return {
    elapsedMs: (lap.endElapsedMs ?? record.elapsedMs) - lap.startElapsedMs,
    distanceM: (lap.endDistanceM ?? record.distanceM) - lap.startDistanceM,
    elevGainM: (lap.endElevGainM ?? record.elevGainM) - lap.startElevGainM,
    elevLossM: (lap.endElevLossM ?? record.elevLossM) - lap.startElevLossM,
  }
}

/** Lap end in moving time; the open lap ends "now". */
export function lapEndMs(record: WorkoutRecord, lap: Lap): number {
  return lap.endElapsedMs ?? record.elapsedMs
}

/**
 * Average heart rate over a span of moving time, from the 1 Hz samples.
 * Returns null if no sample in the span has a heart rate.
 */
export function averageHr(record: WorkoutRecord, fromMs = 0, toMs = Infinity): number | null {
  let sum = 0
  let n = 0
  // Samples are in time order; each one covers the second ending at `t`.
  for (const s of record.samples) {
    if (s.t <= fromMs) continue
    if (s.t > toMs) break
    if (s.hr != null) {
      sum += s.hr
      n++
    }
  }
  return n > 0 ? sum / n : null
}

export function lapAverageHr(record: WorkoutRecord, lap: Lap): number | null {
  return averageHr(record, lap.startElapsedMs, lapEndMs(record, lap))
}

// ---- helpers ------------------------------------------------------------

function openLap(
  index: number,
  trigger: Lap['trigger'],
  elapsedMs: number,
  distanceM: number,
  elevGainM: number,
  elevLossM: number,
): Lap {
  return {
    index,
    trigger,
    startElapsedMs: elapsedMs,
    startDistanceM: distanceM,
    startElevGainM: elevGainM,
    startElevLossM: elevLossM,
  }
}

function closeCurrentLap(record: WorkoutRecord): Lap[] {
  const laps = [...record.laps]
  const last = laps[laps.length - 1]
  laps[laps.length - 1] = {
    ...last,
    endElapsedMs: record.elapsedMs,
    endDistanceM: record.distanceM,
    endElevGainM: record.elevGainM,
    endElevLossM: record.elevLossM,
  }
  return laps
}

function round(v: number, decimals: number): number {
  const f = 10 ** decimals
  return Math.round(v * f) / f
}
