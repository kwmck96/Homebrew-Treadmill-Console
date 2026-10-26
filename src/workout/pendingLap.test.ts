import { describe, expect, it } from 'vitest'
import { advancePendingLap, LAP_COUNTDOWN_MS, type PendingLap, rampProgress, startPendingLap } from './pendingLap'

const RATES = { speedMphPerSec: 2, inclinePctPerSec: 1 }

/** Tick at 250 ms (ramp and real time equal) until the lap fires. */
function runToLap(p: PendingLap, targets = { speedMph: p.targetSpeedMph, inclinePct: p.targetInclinePct }) {
  let pending: PendingLap | null = p
  let ms = 0
  let rampDoneAt: number | null = null
  while (pending && ms < 60_000) {
    const r = advancePendingLap(pending, targets, 250, 250, RATES)
    ms += 250
    if (r.pending?.phase === 'countdown' && rampDoneAt == null) rampDoneAt = ms
    if (r.fireLap) return { firedAt: ms, rampDoneAt }
    pending = r.pending
  }
  return { firedAt: null, rampDoneAt }
}

describe('pending preset lap', () => {
  it('ramps at the estimated rate, then counts down 3 s, then fires', () => {
    // 7 → 11 mph at 2 mph/s = 2 s; incline unchanged.
    const p = startPendingLap(null, { speedMph: 7, inclinePct: 1 }, { speedMph: 11, inclinePct: 1 })
    const { firedAt, rampDoneAt } = runToLap(p)
    expect(rampDoneAt).toBe(2000)
    expect(firedAt).toBe(2000 + LAP_COUNTDOWN_MS)
  })

  it('waits for the slower of speed and incline', () => {
    // incline 0 → 4 % at 1 %/s = 4 s; speed 7 → 8 = 0.5 s
    const p = startPendingLap(null, { speedMph: 7, inclinePct: 0 }, { speedMph: 8, inclinePct: 4 })
    expect(runToLap(p).rampDoneAt).toBe(4000)
  })

  it('reports the estimate climbing toward the target', () => {
    let p = startPendingLap(null, { speedMph: 7, inclinePct: 1 }, { speedMph: 11, inclinePct: 1 })
    p = advancePendingLap(p, { speedMph: 11, inclinePct: 1 }, 1000, 1000, RATES).pending!
    expect(p.estSpeedMph).toBe(9)
    expect(rampProgress(p.fromSpeedMph, p.estSpeedMph, p.targetSpeedMph)).toBe(0.5)
  })

  it('restarts the ramp when the target moves during the countdown', () => {
    let p = startPendingLap(null, { speedMph: 7, inclinePct: 1 }, { speedMph: 8, inclinePct: 1 })
    p = advancePendingLap(p, { speedMph: 8, inclinePct: 1 }, 1000, 1000, RATES).pending!
    p = advancePendingLap(p, { speedMph: 8, inclinePct: 1 }, 1000, 1000, RATES).pending!
    expect(p.phase).toBe('countdown')
    // Wheel nudged to 9 mph mid-countdown
    p = advancePendingLap(p, { speedMph: 9, inclinePct: 1 }, 250, 250, RATES).pending!
    expect(p.phase).toBe('ramping')
    expect(p.fromSpeedMph).toBe(8)
    expect(p.countdownLeftMs).toBe(LAP_COUNTDOWN_MS)
  })

  it('a second tap re-targets from the current estimate instead of stacking', () => {
    let p = startPendingLap(null, { speedMph: 7, inclinePct: 1 }, { speedMph: 11, inclinePct: 1 })
    p = advancePendingLap(p, { speedMph: 11, inclinePct: 1 }, 1000, 1000, RATES).pending! // at 9
    p = startPendingLap(p, { speedMph: 99, inclinePct: 99 }, { speedMph: 11, inclinePct: 4 })
    expect(p.estSpeedMph).toBe(9) // continues from the estimate, ignores `current`
    expect(p.phase).toBe('ramping')
    expect(runToLap(p).rampDoneAt).toBe(3000) // incline 1 → 4 dominates
  })

  it("ignores a driver that confirms the new target a tick late", () => {
    // Tapped Run at 7 mph; the treadmill still reports the old 7.0 target for a tick.
    let p = startPendingLap(null, { speedMph: 7, inclinePct: 1 }, { speedMph: 11, inclinePct: 1 }, {
      speedMph: 7,
      inclinePct: 1,
    })
    p = advancePendingLap(p, { speedMph: 7, inclinePct: 1 }, 250, 250, RATES).pending!
    expect(p.targetSpeedMph).toBe(11)
    p = advancePendingLap(p, { speedMph: 11, inclinePct: 1 }, 250, 250, RATES).pending!
    expect(p.targetSpeedMph).toBe(11)
    expect(p.fromSpeedMph).toBe(7) // progress bar didn't reset
  })

  it('counts down in real time even when the ramp runs faster (sim time warp)', () => {
    let p = startPendingLap(null, { speedMph: 7, inclinePct: 1 }, { speedMph: 8, inclinePct: 1 })
    // 30× warp: 250 ms real = 7.5 s simulated
    p = advancePendingLap(p, { speedMph: 8, inclinePct: 1 }, 7500, 250, RATES).pending!
    expect(p.phase).toBe('countdown')
    p = advancePendingLap(p, { speedMph: 8, inclinePct: 1 }, 7500, 250, RATES).pending!
    expect(p.countdownLeftMs).toBe(LAP_COUNTDOWN_MS - 250)
  })
})
