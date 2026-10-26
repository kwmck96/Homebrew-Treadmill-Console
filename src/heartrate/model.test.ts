import { describe, expect, it } from 'vitest'
import { addLap, advance, averageHr, createWorkout, lapAverageHr } from '../workout/engine'
import { DEFAULT_HR_PROFILE, oxygenCost, steadyStateHr, stepHr } from './model'
import { SimulatedHeartRate } from './simulator'

describe('heart-rate model', () => {
  it('matches the ACSM running equation', () => {
    // 6 mph = 160.9 m/min, flat: 0.2 × 160.9 + 3.5 ≈ 35.7
    expect(oxygenCost(6, 0)).toBeCloseTo(35.7, 1)
    // Incline adds cost
    expect(oxygenCost(6, 5)).toBeGreaterThan(oxygenCost(6, 0))
  })

  it('orders steady states sensibly and stays within rest–max', () => {
    const walk = steadyStateHr(3, 0)
    const easy = steadyStateHr(7, 0)
    const hard = steadyStateHr(11, 0)
    expect(walk).toBeLessThan(easy)
    expect(easy).toBeLessThan(hard)
    expect(steadyStateHr(0, 0)).toBe(DEFAULT_HR_PROFILE.restBpm)
    expect(steadyStateHr(16, 15)).toBe(DEFAULT_HR_PROFILE.maxBpm)
  })

  it('approaches the target without overshooting, faster going up', () => {
    let hr = 70
    for (let i = 0; i < 25; i++) hr = stepHr(hr, 170, 1)
    const upProgress = (hr - 70) / 100
    expect(hr).toBeLessThan(170)
    let down = 170
    for (let i = 0; i < 25; i++) down = stepHr(down, 70, 1)
    const downProgress = (170 - down) / 100
    expect(upProgress).toBeGreaterThan(downProgress)
  })

  it('simulated strap reports bpm while connected and null when not', async () => {
    const hr = new SimulatedHeartRate({ random: () => 0.5 })
    expect(hr.getState().bpm).toBeNull()
    await hr.connect()
    for (let i = 0; i < 300; i++) hr.feed(7, 0, 1000)
    expect(hr.getState().bpm).toBeCloseTo(steadyStateHr(7, 0), -1)
    await hr.disconnect()
    expect(hr.getState().bpm).toBeNull()
  })
})

describe('workout HR averages', () => {
  it('averages HR per lap from samples', () => {
    let r = createWorkout(0)
    for (let i = 0; i < 60; i++) {
      r = advance(r, { actualSpeedMph: 6, actualInclinePct: 0, connected: true, heartRateBpm: 140 }, 1000, 0)
    }
    r = addLap(r, 0)
    for (let i = 0; i < 30; i++) {
      r = advance(r, { actualSpeedMph: 9, actualInclinePct: 0, connected: true, heartRateBpm: 170 }, 1000, 0)
    }
    expect(lapAverageHr(r, r.laps[0])).toBe(140)
    expect(lapAverageHr(r, r.laps[1])).toBe(170)
    expect(averageHr(r)).toBeCloseTo(150, 5)
  })

  it('is null without a strap', () => {
    let r = createWorkout(0)
    r = advance(r, { actualSpeedMph: 6, actualInclinePct: 0, connected: true, heartRateBpm: null }, 1000, 0)
    expect(averageHr(r)).toBeNull()
  })
})
