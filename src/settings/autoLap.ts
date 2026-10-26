/**
 * Auto-lap distance and its own unit, independent of the app's distance unit
 * (Kyle, 2026-10-26): e.g. paces in miles but splits every 400 m.
 *
 * Miles are stepped by 0.05 mi. Meters are stepped by 50 m below 1000 m and
 * 100 m from 1000 m up.
 */
import { type DistanceUnit, METERS_PER_MILE } from '../lib/units'

export type AutoLapUnit = 'mi' | 'm'

export const AUTO_LAP_LIMITS: Record<AutoLapUnit, { min: number; max: number }> = {
  mi: { min: 0.05, max: 10 },
  m: { min: 50, max: 20000 },
}

export const AUTO_LAP_PICKS: Record<AutoLapUnit, number[]> = {
  mi: [0.25, 0.5, 1],
  m: [400, 1000, 2000],
}

export function autoLapToMeters(value: number, unit: AutoLapUnit): number {
  return unit === 'mi' ? value * METERS_PER_MILE : value
}

export function formatAutoLap(value: number, unit: AutoLapUnit): string {
  return unit === 'mi' ? `${value.toFixed(2)} mi` : `${Math.round(value)} m`
}

/** One −/+ step, kept on the grid and within limits. */
export function stepAutoLap(value: number, unit: AutoLapUnit, dir: 1 | -1): number {
  let next: number
  if (unit === 'mi') {
    next = Math.round((value + dir * 0.05) * 20) / 20
  } else {
    // 50 m steps below 1000 m, 100 m from there up (and 1000 → 950 going down).
    const size = value > 1000 || (value === 1000 && dir > 0) ? 100 : 50
    next = snap(value + dir * size, size)
  }
  return clamp(next, unit)
}

/**
 * Switching only the auto-lap unit: keep (about) the same real distance,
 * snapped to the new unit's grid. 0.25 mi → 400 m, 400 m → 0.25 mi.
 */
export function convertAutoLap(value: number, from: AutoLapUnit, to: AutoLapUnit): number {
  if (from === to) return value
  const meters = autoLapToMeters(value, from)
  if (to === 'mi') return clamp(Math.round((meters / METERS_PER_MILE) * 20) / 20, 'mi')
  return clamp(snap(meters, meters >= 1000 ? 100 : 50), 'm')
}

/**
 * Switching the app's distance unit carries the auto-lap number across
 * (approved by Kyle): 1 mi becomes 1 km (1000 m), 400 m becomes 0.40 mi.
 */
export function followDistanceUnit(
  value: number,
  unit: AutoLapUnit,
  distanceUnit: DistanceUnit,
): { value: number; unit: AutoLapUnit } {
  if (distanceUnit === 'mi' && unit === 'm') {
    return { value: clamp(Math.round((value / 1000) * 20) / 20, 'mi'), unit: 'mi' }
  }
  if (distanceUnit === 'km' && unit === 'mi') {
    return { value: clamp(snap(value * 1000, 50), 'm'), unit: 'm' }
  }
  return { value, unit }
}

function snap(v: number, size: number): number {
  return Math.round(v / size) * size
}

function clamp(v: number, unit: AutoLapUnit): number {
  const { min, max } = AUTO_LAP_LIMITS[unit]
  return Math.min(max, Math.max(min, v))
}
