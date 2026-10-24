import { describe, expect, it } from 'vitest'
import { clampIncline, clampSpeed, quantize, TRM885_LIMITS } from './limits'
import { SimulatedTreadmill } from './simulator'

async function connectedSim() {
  const sim = new SimulatedTreadmill({ autoTick: false, connectDelayMs: 0, now: () => 0 })
  await sim.connect()
  return sim
}

/** Advance in 100 ms steps, like the real timer. */
function run(sim: SimulatedTreadmill, seconds: number) {
  for (let i = 0; i < seconds * 10; i++) sim.advance(100)
}

describe('limits', () => {
  it('quantizes without float noise', () => {
    expect(quantize(0.1 + 0.2, 0.1)).toBe(0.3)
    expect(quantize(7.04, 0.1)).toBe(7)
    expect(quantize(2.74, 0.5)).toBe(2.5)
  })

  it('clamps speed and incline to the TRM 885 range', () => {
    expect(clampSpeed(20, TRM885_LIMITS)).toBe(16)
    expect(clampSpeed(0.1, TRM885_LIMITS)).toBe(0.5)
    expect(clampIncline(-5, TRM885_LIMITS)).toBe(-3)
    expect(clampIncline(15.3, TRM885_LIMITS)).toBe(15)
  })
})

describe('SimulatedTreadmill', () => {
  it('connects with the belt stopped (safe start, S4)', async () => {
    const sim = await connectedSim()
    const s = sim.getState()
    expect(s.connection).toBe('connected')
    expect(s.belt).toBe('stopped')
    expect(s.actualSpeedMph).toBe(0)
  })

  it('ignores speed and incline commands while stopped', async () => {
    const sim = await connectedSim()
    await sim.setSpeed(8)
    await sim.setIncline(5)
    expect(sim.getState().targetSpeedMph).toBe(0)
    expect(sim.getState().targetInclinePct).toBe(0)
  })

  it('ramps toward the target instead of jumping', async () => {
    const sim = await connectedSim()
    await sim.start(1)
    run(sim, 1)
    expect(sim.getState().actualSpeedMph).toBeCloseTo(1, 5)
    await sim.setSpeed(5)
    run(sim, 1)
    const mid = sim.getState().actualSpeedMph
    expect(mid).toBeGreaterThan(1)
    expect(mid).toBeLessThan(5)
    run(sim, 10)
    expect(sim.getState().actualSpeedMph).toBe(5)
  })

  it('clamps out-of-range commands', async () => {
    const sim = await connectedSim()
    await sim.start(1)
    await sim.setSpeed(99)
    await sim.setIncline(40)
    expect(sim.getState().targetSpeedMph).toBe(16)
    expect(sim.getState().targetInclinePct).toBe(15)
  })

  it('stop() ramps the belt to rest', async () => {
    const sim = await connectedSim()
    await sim.start(3)
    run(sim, 5)
    await sim.stop()
    expect(sim.getState().belt).toBe('stopping')
    run(sim, 5)
    expect(sim.getState().belt).toBe('stopped')
    expect(sim.getState().actualSpeedMph).toBe(0)
  })

  it('safety stop halts the belt and blocks restart until reset', async () => {
    const sim = await connectedSim()
    await sim.start(3)
    run(sim, 5)
    sim.simulateSafetyStop()
    run(sim, 2)
    expect(sim.getState().belt).toBe('stopped')
    await sim.start(1)
    expect(sim.getState().belt).toBe('stopped')
    sim.resetSafetyStop()
    expect(sim.getState().belt).toBe('stopped') // reset alone never starts the belt
    await sim.start(1)
    expect(sim.getState().belt).toBe('running')
  })

  it('connection loss stops the belt and freezes what the app sees (S2)', async () => {
    const sim = await connectedSim()
    await sim.start(3)
    run(sim, 5)
    sim.simulateConnectionLoss()
    const frozen = sim.getState()
    expect(frozen.connection).toBe('disconnected')
    run(sim, 5)
    expect(sim.getState().actualSpeedMph).toBe(frozen.actualSpeedMph)
    await sim.connect()
    expect(sim.getState().belt).toBe('stopped')
    expect(sim.getState().actualSpeedMph).toBe(0)
  })
})
