/**
 * Configurable data fields (M7). Each field turns the current workout and
 * treadmill state into a display value. Add a field here and it becomes
 * selectable in the field picker automatically.
 */
import {
  averageMph,
  type DistanceUnit,
  elevationUnitLabel,
  formatDistance,
  formatDuration,
  formatElevation,
  formatPace,
  formatSpeed,
  paceUnitLabel,
  speedUnitLabel,
} from '../lib/units'
import { hrColor } from '../lib/hrColor'
import { averageHr, currentLap, lapAverageHr, lapTotals } from './engine'
import type { WorkoutRecord } from './types'

export interface FieldContext {
  record: WorkoutRecord | null
  actualSpeedMph: number
  actualInclinePct: number
  /** Latest heart rate, or null with no strap connected. */
  heartRateBpm: number | null
  unit: DistanceUnit
}

export interface FieldValue {
  value: string
  unit?: string
  /** Optional colour for the value (heart rate uses its colour scale). */
  color?: string
}

export interface FieldDef {
  id: string
  label: string
  compute: (ctx: FieldContext) => FieldValue
}

const distUnit = (u: DistanceUnit) => (u === 'mi' ? 'mi' : 'km')

const FIELD_DEFS = [
  {
    id: 'elapsed',
    label: 'Time',
    compute: ({ record }) => ({ value: formatDuration(record?.elapsedMs ?? 0) }),
  },
  {
    id: 'distance',
    label: 'Distance',
    compute: ({ record, unit }) => ({
      value: formatDistance(record?.distanceM ?? 0, unit),
      unit: distUnit(unit),
    }),
  },
  {
    id: 'lapTime',
    label: 'Lap Time',
    compute: ({ record }) => ({
      value: formatDuration(record ? lapTotals(record, currentLap(record)).elapsedMs : 0),
    }),
  },
  {
    id: 'lapDistance',
    label: 'Lap Distance',
    compute: ({ record, unit }) => ({
      value: formatDistance(record ? lapTotals(record, currentLap(record)).distanceM : 0, unit),
      unit: distUnit(unit),
    }),
  },
  {
    id: 'lapPace',
    label: 'Lap Avg Pace',
    compute: ({ record, unit }) => {
      const t = record ? lapTotals(record, currentLap(record)) : null
      return {
        value: formatPace(t ? averageMph(t.distanceM, t.elapsedMs) : 0, unit),
        unit: paceUnitLabel(unit),
      }
    },
  },
  {
    id: 'lapNumber',
    label: 'Lap',
    compute: ({ record }) => ({ value: String(record ? currentLap(record).index : 1) }),
  },
  {
    id: 'currentPace',
    label: 'Pace',
    compute: ({ actualSpeedMph, unit }) => ({
      value: formatPace(actualSpeedMph, unit),
      unit: paceUnitLabel(unit),
    }),
  },
  {
    id: 'currentSpeed',
    label: 'Speed',
    compute: ({ actualSpeedMph, unit }) => ({
      value: formatSpeed(actualSpeedMph, unit),
      unit: speedUnitLabel(unit),
    }),
  },
  {
    id: 'avgPace',
    label: 'Avg Pace',
    compute: ({ record, unit }) => ({
      value: formatPace(record ? averageMph(record.distanceM, record.elapsedMs) : 0, unit),
      unit: paceUnitLabel(unit),
    }),
  },
  {
    id: 'avgSpeed',
    label: 'Avg Speed',
    compute: ({ record, unit }) => ({
      value: formatSpeed(record ? averageMph(record.distanceM, record.elapsedMs) : 0, unit),
      unit: speedUnitLabel(unit),
    }),
  },
  {
    id: 'incline',
    label: 'Incline',
    compute: ({ actualInclinePct }) => ({ value: actualInclinePct.toFixed(1), unit: '%' }),
  },
  {
    id: 'netElev',
    label: 'Net Elevation',
    compute: ({ record, unit }) => {
      const net = record ? record.elevGainM - record.elevLossM : 0
      const s = formatElevation(net, unit)
      return { value: net > 0 && s !== '0' ? `+${s}` : s, unit: elevationUnitLabel(unit) }
    },
  },
  {
    id: 'elevGain',
    label: 'Elev Gain',
    compute: ({ record, unit }) => ({
      value: formatElevation(record?.elevGainM ?? 0, unit),
      unit: elevationUnitLabel(unit),
    }),
  },
  {
    id: 'elevLoss',
    label: 'Elev Loss',
    compute: ({ record, unit }) => ({
      value: formatElevation(record?.elevLossM ?? 0, unit),
      unit: elevationUnitLabel(unit),
    }),
  },
  {
    id: 'heartRate',
    label: 'Heart Rate',
    compute: ({ heartRateBpm }) => ({
      value: formatBpm(heartRateBpm),
      unit: 'bpm',
      color: hrColor(heartRateBpm),
    }),
  },
  {
    id: 'avgHr',
    label: 'Avg HR',
    compute: ({ record }) => ({ value: formatBpm(record ? averageHr(record) : null), unit: 'bpm' }),
  },
  {
    id: 'lapAvgHr',
    label: 'Lap Avg HR',
    compute: ({ record }) => ({
      value: formatBpm(record ? lapAverageHr(record, currentLap(record)) : null),
      unit: 'bpm',
    }),
  },
] as const satisfies readonly FieldDef[]

export function formatBpm(bpm: number | null): string {
  return bpm == null ? '--' : String(Math.round(bpm))
}

export type FieldId = (typeof FIELD_DEFS)[number]['id']

export const FIELDS: readonly FieldDef[] = FIELD_DEFS

export const FIELDS_BY_ID: Record<string, FieldDef> = Object.fromEntries(
  FIELD_DEFS.map((f) => [f.id, f]),
)
