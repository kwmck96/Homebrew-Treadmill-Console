/**
 * Unit conversion and formatting. Internally: speed in mph (treadmill-native),
 * distance and elevation in meters, time in milliseconds.
 */

export type DistanceUnit = 'mi' | 'km'
export type SpeedDisplay = 'pace' | 'speed'

export const METERS_PER_MILE = 1609.344
export const KM_PER_MILE = 1.609344
export const FEET_PER_METER = 3.28084

export function mphToMetersPerSec(mph: number): number {
  return (mph * METERS_PER_MILE) / 3600
}

export function formatSpeed(mph: number, unit: DistanceUnit): string {
  const v = unit === 'mi' ? mph : mph * KM_PER_MILE
  return v.toFixed(1)
}

export function speedUnitLabel(unit: DistanceUnit): string {
  return unit === 'mi' ? 'mph' : 'km/h'
}

/** Pace in seconds per mile or km. Infinity when stopped. */
export function paceSecPerUnit(mph: number, unit: DistanceUnit): number {
  if (mph < 0.05) return Infinity
  const perHour = unit === 'mi' ? mph : mph * KM_PER_MILE
  return 3600 / perHour
}

export function formatPace(mph: number, unit: DistanceUnit): string {
  const sec = paceSecPerUnit(mph, unit)
  // Anything slower than 60:00/unit is effectively "stopped" for display.
  if (!Number.isFinite(sec) || sec >= 3600) return '--:--'
  const rounded = Math.round(sec)
  return `${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(2, '0')}`
}

export function paceUnitLabel(unit: DistanceUnit): string {
  return unit === 'mi' ? '/mi' : '/km'
}

export function formatDistance(meters: number, unit: DistanceUnit, decimals = 2): string {
  const v = unit === 'mi' ? meters / METERS_PER_MILE : meters / 1000
  return v.toFixed(decimals)
}

export function formatElevation(meters: number, unit: DistanceUnit): string {
  const v = unit === 'mi' ? meters * FEET_PER_METER : meters
  return Math.round(v).toString()
}

export function elevationUnitLabel(unit: DistanceUnit): string {
  return unit === 'mi' ? 'ft' : 'm'
}

/** h:mm:ss, or m:ss under an hour. */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const ss = String(s).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
}

/** Average speed in mph from meters and milliseconds. */
export function averageMph(meters: number, ms: number): number {
  if (ms <= 0) return 0
  return meters / METERS_PER_MILE / (ms / 3_600_000)
}
