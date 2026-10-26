/** Human-readable text for plans, in the user's units. */
import { type DistanceUnit, FEET_PER_METER, formatDuration, KM_PER_MILE, METERS_PER_MILE } from '../lib/units'
import { BLOCK_LABELS } from './defaults'
import { paceToBeltMph } from './expand'
import type { Block, Duration, Recovery, RestSpec, StepSpec } from './types'

/** "6:00" per mile or per km. */
export function formatPaceSec(secPerMile: number, unit: DistanceUnit): string {
  const sec = Math.round(unit === 'mi' ? secPerMile : secPerMile / KM_PER_MILE)
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`
}

export const paceUnit = (unit: DistanceUnit) => (unit === 'mi' ? '/mi' : '/km')

/** Track distances read better in metres. */
const TRACK = [100, 200, 300, 400, 600, 800, 1000, 1200, 1500, 1600, 2000]

export function formatDistanceSpec(meters: number, unit: DistanceUnit): string {
  if (TRACK.includes(Math.round(meters)) && Math.abs(meters - Math.round(meters)) < 0.01) {
    return `${Math.round(meters)} m`
  }
  const v = unit === 'mi' ? meters / METERS_PER_MILE : meters / 1000
  return `${Number(v.toFixed(2))} ${unit}`
}

export function formatDurationSpec(d: Duration, unit: DistanceUnit): string {
  return d.kind === 'time' ? formatDuration(d.seconds * 1000) : formatDistanceSpec(d.meters, unit)
}

export function formatElevation(meters: number, unit: DistanceUnit): string {
  const v = unit === 'mi' ? meters * FEET_PER_METER : meters
  return `${Math.round(v)} ${unit === 'mi' ? 'ft' : 'm'}`
}

/** "6:00/mi", "150 bpm", "Zone 2", "Effort 7", plus incline if any. */
export function describeTarget(s: StepSpec, unit: DistanceUnit): string {
  const t =
    s.targetKind === 'pace'
      ? `${formatPaceSec(s.paceSecPerMile, unit)}${paceUnit(unit)}`
      : s.targetKind === 'hr'
        ? `${s.hrBpm} bpm`
        : s.targetKind === 'zone'
          ? s.zone.mode === 'computed'
            ? `Zone ${s.zone.zone}`
            : `${s.zone.lowBpm}–${s.zone.highBpm} bpm`
          : `Effort ${s.rpe}`
  return s.inclinePct !== 0 ? `${t} · ${s.inclinePct}%` : t
}

export function describeStep(s: StepSpec, unit: DistanceUnit): string {
  return `${formatDurationSpec(s.duration, unit)} @ ${describeTarget(s, unit)}`
}

export function describeRest(r: RestSpec, unit: DistanceUnit): string {
  const where = r.where === 'off' ? 'off treadmill' : `at ${r.onSpeedMph.toFixed(1)} mph`
  const hr = r.useHr ? (r.advanceOnHr ? `, until ${r.hrBpm} bpm` : `, ${r.hrBpm} bpm`) : ''
  return `${formatDurationSpec(r.duration, unit)} rest ${where}${hr}`
}

export function describeRecovery(r: Recovery, unit: DistanceUnit): string {
  return r.kind === 'active' ? `${describeStep(r.active, unit)} recovery` : describeRest(r.rest, unit)
}

/** One-line summary for a block card. */
export function describeBlock(b: Block, unit: DistanceUnit): string {
  switch (b.type) {
    case 'warmup':
    case 'steady':
    case 'activeRecovery':
    case 'cooldown':
      return describeStep(b.step, unit)
    case 'rest':
      return describeRest(b.rest, unit)
    case 'strides':
    case 'intervals':
    case 'hills':
      return `${b.reps} × ${describeStep(b.work, unit)}, ${describeRecovery(b.recovery, unit)}`
    case 'nested':
      return `${b.sets} sets × ${b.reps} × ${describeStep(b.work, unit)}, ${describeRecovery(b.recovery, unit)}; ${describeRecovery(b.setRecovery, unit)} between sets`
  }
}

export function blockTitle(b: Block): string {
  return BLOCK_LABELS[b.type]
}

/**
 * When a pace can't be hit exactly at 0.1 mph resolution, the pace the belt
 * will actually run, e.g. 8:30 → "7.1 mph (8:27/mi)".
 */
export function beltNote(secPerMile: number, unit: DistanceUnit): string {
  const mph = paceToBeltMph(secPerMile)
  const actual = 3600 / mph
  const speed = unit === 'mi' ? `${mph.toFixed(1)} mph` : `${(mph * KM_PER_MILE).toFixed(1)} km/h`
  return Math.round(actual) === Math.round(secPerMile)
    ? `Belt ${speed}`
    : `Belt ${speed} (${formatPaceSec(actual, unit)}${paceUnit(unit)})`
}
