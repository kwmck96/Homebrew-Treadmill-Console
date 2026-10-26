import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { DistanceUnit, SpeedDisplay } from '../lib/units'
import type { FieldId } from '../workout/fields'

export interface Preset {
  id: string
  label: string
  value: number
}

export type ConsoleView = 'control' | 'charts' | 'builder'
export type ChartRange = '5' | '15' | 'full'

export interface Settings {
  distanceUnit: DistanceUnit
  /** Whether the big readout shows pace (min/mi) or speed (mph). */
  speedDisplay: SpeedDisplay
  /** Belt speed used by Start and Resume. Always a walking speed (S4). */
  startSpeedMph: number
  /** −3 per Precor spec; set to 0 if the decline doesn't exist on this unit. */
  minInclinePct: number
  speedPresets: Preset[]
  inclinePresets: Preset[]
  /** Which metric shows in each data-field slot, in order. */
  dataFields: FieldId[]
  /** Which workout view is on screen. */
  view: ConsoleView
  /** Time range shown on the Charts view's graph. */
  chartRange: ChartRange
  /** Tapping Run or Recover on the Charts view also splits a lap. */
  lapOnPresetTap: boolean
  /** Control Center: tapping a speed preset also splits a lap. */
  lapOnSpeedPresetTap: boolean
  /** Control Center: tapping an incline preset also splits a lap. */
  lapOnInclinePresetTap: boolean
  /** For HR zones (heart-rate reserve model). */
  maxHr: number
  restHr: number
  /** Beeps for workout step changes. */
  sounds: boolean
}

interface SettingsActions {
  update: (patch: Partial<Settings>) => void
  setPresetValue: (kind: 'speed' | 'incline', id: string, value: number) => void
  /** Put `field` in `slot`; if it's already shown elsewhere, the two swap. */
  setDataField: (slot: number, field: FieldId) => void
  resetToDefaults: () => void
}

export const DEFAULT_SETTINGS: Settings = {
  distanceUnit: 'mi',
  speedDisplay: 'pace',
  startSpeedMph: 1.0,
  minInclinePct: -3,
  speedPresets: [
    { id: 'rest', label: 'Rest', value: 3.0 },
    { id: 'recovery', label: 'Recovery', value: 7.0 },
    { id: 'run', label: 'Run', value: 11.0 },
  ],
  // Placeholder incline presets; edit in the app.
  inclinePresets: [
    { id: 'flat', label: 'Flat', value: 0 },
    { id: 'road', label: 'Road', value: 1 },
    { id: 'hill', label: 'Hill', value: 4 },
  ],
  // Control Center: two full-width slots on top, then a 2 × 2 grid.
  dataFields: ['elapsed', 'heartRate', 'distance', 'lapTime', 'lapDistance', 'avgPace'],
  view: 'control',
  chartRange: '15',
  lapOnPresetTap: true,
  lapOnSpeedPresetTap: true,
  lapOnInclinePresetTap: true,
  maxHr: 190,
  restHr: 55,
  sounds: true,
}

const OLD_DEFAULT_FIELDS = ['elapsed', 'distance', 'lapTime', 'lapDistance', 'avgPace', 'elevGain']

export const useSettings = create<Settings & SettingsActions>()(
  persist(
    (set) => ({
      ...DEFAULT_SETTINGS,
      update: (patch) => set(patch),
      setPresetValue: (kind, id, value) =>
        set((s) => {
          const key = kind === 'speed' ? 'speedPresets' : 'inclinePresets'
          return { [key]: s[key].map((p) => (p.id === id ? { ...p, value } : p)) }
        }),
      setDataField: (slot, field) =>
        set((s) => {
          const dataFields = [...s.dataFields]
          const other = dataFields.indexOf(field)
          if (other >= 0 && other !== slot) dataFields[other] = dataFields[slot]
          dataFields[slot] = field
          return { dataFields }
        }),
      // Keep the current view and chart range; "reset" is about workout settings.
      resetToDefaults: () =>
        set((s) => ({ ...DEFAULT_SETTINGS, view: s.view, chartRange: s.chartRange })),
    }),
    {
      name: 'htc-settings',
      // Bump when the Settings shape changes and add to `migrate`.
      version: 2,
      migrate: (persisted, version) => {
        const s = persisted as Partial<Settings>
        // v2: new Control Center layout. Untouched old defaults move to the new
        // ones; anything customised is kept.
        if (version < 2 && JSON.stringify(s.dataFields) === JSON.stringify(OLD_DEFAULT_FIELDS)) {
          s.dataFields = DEFAULT_SETTINGS.dataFields
        }
        return s as Settings & SettingsActions
      },
    },
  ),
)
