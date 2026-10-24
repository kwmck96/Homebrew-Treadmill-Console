import { describe, expect, it } from 'vitest'
import { METERS_PER_MILE } from '../lib/units'
import { addLap, advance, createWorkout, currentLap, finish, lapTotals, pause, resume } from './engine'
import { FIELDS_BY_ID } from './fields'
import type { WorkoutRecord } from './types'

const moving = (speed: number, incline = 0) => ({
  actualSpeedMph: speed,
  actualInclinePct: incline,
  connected: true,
})

/** Simulate `seconds` of 250 ms ticks. */
function runFor(record: WorkoutRecord, seconds: number, speed: number, incline = 0) {
  let r = record
  for (let i = 0; i < seconds * 4; i++) r = advance(r, moving(speed, incline), 250, 0)
  return r
}

describe('workout engine', () => {
  it('integrates distance from belt speed', () => {
    // 6 mph for 10 minutes = 1 mile
    const r = runFor(createWorkout(0), 600, 6)
    expect(r.distanceM).toBeCloseTo(METERS_PER_MILE, 3)
    expect(r.elapsedMs).toBe(600_000)
  })

  it('records one sample per second of moving time', () => {
    const r = runFor(createWorkout(0), 10, 5)
    expect(r.samples).toHaveLength(10)
    expect(r.samples[9].t).toBe(10_000)
  })

  it('accumulates elevation gain and loss from grade', () => {
    let r = runFor(createWorkout(0), 600, 6, 10) // 1 mile at 10 %
    // vertical = d × sin(atan(0.10)) ≈ d × 0.0995
    expect(r.elevGainM).toBeCloseTo(METERS_PER_MILE * 0.0995037, 1)
    r = runFor(r, 600, 6, -3)
    expect(r.elevLossM).toBeGreaterThan(0)
    expect(r.elevGainM - r.elevLossM).toBeLessThan(r.elevGainM)
  })

  it('stops the clock while paused but keeps counting belt distance', () => {
    let r = runFor(createWorkout(0), 10, 6)
    r = pause(r, 'user', 0)
    const before = { t: r.elapsedMs, d: r.distanceM }
    r = runFor(r, 2, 3) // belt still decelerating
    expect(r.elapsedMs).toBe(before.t)
    expect(r.distanceM).toBeGreaterThan(before.d)
    r = resume(r, 0)
    r = runFor(r, 1, 1)
    expect(r.elapsedMs).toBe(before.t + 1000)
  })

  it('ignores distance while disconnected', () => {
    let r = createWorkout(0)
    r = advance(r, { actualSpeedMph: 8, actualInclinePct: 0, connected: false }, 250, 0)
    expect(r.distanceM).toBe(0)
  })

  it('caps large time gaps (app suspended)', () => {
    const r = advance(createWorkout(0), moving(6), 60_000, 0)
    expect(r.elapsedMs).toBe(2000)
  })

  it('keeps a safety-stop reason over a later user pause', () => {
    let r = pause(createWorkout(0), 'safetyStop', 0)
    r = pause(r, 'user', 0)
    expect(r.pauseReason).toBe('safetyStop')
  })

  it('splits laps', () => {
    let r = runFor(createWorkout(0), 60, 6)
    r = addLap(r, 0)
    r = runFor(r, 30, 6)
    expect(r.laps).toHaveLength(2)
    expect(lapTotals(r, r.laps[0]).elapsedMs).toBe(60_000)
    expect(lapTotals(r, currentLap(r)).elapsedMs).toBe(30_000)
    r = finish(r, 1)
    expect(r.status).toBe('finished')
    expect(r.laps[1].endElapsedMs).toBe(90_000)
    expect(addLap(r, 2)).toBe(r) // no laps after finishing
  })
})

describe('fields', () => {
  it('formats pace and distance in both units', () => {
    const r = runFor(createWorkout(0), 600, 6)
    const ctx = { record: r, actualSpeedMph: 6, actualInclinePct: 0 }
    expect(FIELDS_BY_ID.currentPace.compute({ ...ctx, unit: 'mi' }).value).toBe('10:00')
    expect(FIELDS_BY_ID.distance.compute({ ...ctx, unit: 'mi' }).value).toBe('1.00')
    expect(FIELDS_BY_ID.distance.compute({ ...ctx, unit: 'km' }).value).toBe('1.61')
    expect(FIELDS_BY_ID.avgPace.compute({ ...ctx, unit: 'km' }).value).toBe('6:13')
    expect(FIELDS_BY_ID.elapsed.compute({ ...ctx, unit: 'mi' }).value).toBe('10:00')
  })

  it('shows placeholders when stopped', () => {
    const ctx = { record: null, actualSpeedMph: 0, actualInclinePct: 0, unit: 'mi' as const }
    expect(FIELDS_BY_ID.currentPace.compute(ctx).value).toBe('--:--')
    expect(FIELDS_BY_ID.elapsed.compute(ctx).value).toBe('0:00')
  })
})
