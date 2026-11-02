import { describe, expect, it } from 'vitest'
import { HeartRateHub } from './hub'
import type { HeartRateState } from './types'

describe('heart-rate hub', () => {
  it('forwards the active source and switches without losing listeners', async () => {
    const hub = new HeartRateHub('simulated', null)
    const seen: HeartRateState[] = []
    hub.subscribe((s) => seen.push(s))
    await hub.connect()
    expect(hub.mode).toBe('simulated')
    expect(hub.getState().connection).toBe('connected')
    expect(hub.simulatedSource).not.toBeNull()

    // Bluetooth with nothing paired: not connected, and says why.
    await hub.use('bluetooth')
    expect(hub.mode).toBe('bluetooth')
    expect(hub.simulatedSource).toBeNull()
    expect(hub.getState()).toMatchObject({ connection: 'disconnected', bpm: null, detail: 'No sensor paired yet.' })

    await hub.use('simulated')
    expect(hub.getState().connection).toBe('connected')
    expect(seen.at(-1)?.connection).toBe('connected')
  })
})
