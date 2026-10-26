import { describe, expect, it } from 'vitest'
import { autoLapToMeters, convertAutoLap, followDistanceUnit, formatAutoLap, stepAutoLap } from './autoLap'

describe('auto-lap unit', () => {
  it('converts to metres', () => {
    expect(autoLapToMeters(1, 'mi')).toBeCloseTo(1609.344)
    expect(autoLapToMeters(400, 'm')).toBe(400)
  })

  it('formats', () => {
    expect(formatAutoLap(0.25, 'mi')).toBe('0.25 mi')
    expect(formatAutoLap(2000, 'm')).toBe('2000 m')
  })

  it('steps on the grid', () => {
    expect(stepAutoLap(1, 'mi', 1)).toBe(1.05)
    expect(stepAutoLap(0.05, 'mi', -1)).toBe(0.05)
    expect(stepAutoLap(400, 'm', 1)).toBe(450)
    expect(stepAutoLap(950, 'm', 1)).toBe(1000)
    expect(stepAutoLap(1000, 'm', 1)).toBe(1100)
    expect(stepAutoLap(1000, 'm', -1)).toBe(950)
    expect(stepAutoLap(2000, 'm', -1)).toBe(1900)
    expect(stepAutoLap(50, 'm', -1)).toBe(50)
  })

  it('switching only the auto-lap unit keeps the real distance', () => {
    expect(convertAutoLap(0.25, 'mi', 'm')).toBe(400)
    expect(convertAutoLap(1, 'mi', 'm')).toBe(1600)
    expect(convertAutoLap(400, 'm', 'mi')).toBe(0.25)
    expect(convertAutoLap(2000, 'm', 'mi')).toBe(1.25)
  })

  it('switching the app unit carries the number across', () => {
    expect(followDistanceUnit(1, 'mi', 'km')).toEqual({ value: 1000, unit: 'm' })
    expect(followDistanceUnit(1000, 'm', 'mi')).toEqual({ value: 1, unit: 'mi' })
    expect(followDistanceUnit(400, 'm', 'mi')).toEqual({ value: 0.4, unit: 'mi' })
    // Already matching: unchanged (e.g. metres while the app is in km).
    expect(followDistanceUnit(400, 'm', 'km')).toEqual({ value: 400, unit: 'm' })
  })
})

describe('settings store', () => {
  it('carries auto-lap across a change of app units, but not other updates', async () => {
    const { useSettings, autoLapMeters } = await import('./store')
    const s = () => useSettings.getState()
    s().resetToDefaults()
    s().update({ autoLapDistance: 400, autoLapUnit: 'm' })
    s().update({ sounds: false })
    expect(s().autoLapDistance).toBe(400)
    expect(autoLapMeters(s())).toBe(400) // miles app, metre splits
    s().update({ distanceUnit: 'km' })
    expect([s().autoLapDistance, s().autoLapUnit]).toEqual([400, 'm'])
    s().update({ distanceUnit: 'mi' })
    expect([s().autoLapDistance, s().autoLapUnit]).toEqual([0.4, 'mi'])
    s().update({ autoLapDistance: 1 })
    s().update({ distanceUnit: 'km' })
    expect([s().autoLapDistance, s().autoLapUnit]).toEqual([1000, 'm'])
    s().resetToDefaults()
  })
})
