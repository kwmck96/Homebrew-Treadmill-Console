import type { ReactNode } from 'react'
import { quantize } from '../treadmill/limits'
import { useSettings } from '../settings/store'
import { useConsole } from '../workout/store'
import { HoldButton } from './HoldButton'
import styles from './Panels.module.css'
import { Sheet } from './Sheet'

export function SettingsSheet({ onClose }: { onClose: () => void }) {
  const s = useSettings()
  const workoutActive = useConsole((st) => st.workout !== null)

  return (
    <Sheet title="Settings" onClose={onClose}>
      <Row label="Distance units">
        <Segmented
          value={s.distanceUnit}
          options={[
            ['mi', 'Miles'],
            ['km', 'Kilometers'],
          ]}
          onChange={(distanceUnit) => s.update({ distanceUnit })}
        />
      </Row>

      <Row label="Big speed readout shows">
        <Segmented
          value={s.speedDisplay}
          options={[
            ['pace', 'Pace'],
            ['speed', 'Speed'],
          ]}
          onChange={(speedDisplay) => s.update({ speedDisplay })}
        />
      </Row>

      <Row
        label="Start and resume speed"
        hint="The belt always starts here, then use a preset to get up to pace."
      >
        <div className={styles.stepper}>
          <HoldButton
            className={styles.stepperButton}
            aria-label="Lower start speed"
            disabled={s.startSpeedMph <= 0.5}
            onTrigger={() =>
              s.update({ startSpeedMph: Math.max(0.5, quantize(s.startSpeedMph - 0.1, 0.1)) })
            }
          >
            −
          </HoldButton>
          <span className={`${styles.stepperValue} num`}>{s.startSpeedMph.toFixed(1)} mph</span>
          <HoldButton
            className={styles.stepperButton}
            aria-label="Raise start speed"
            disabled={s.startSpeedMph >= 3}
            onTrigger={() =>
              s.update({ startSpeedMph: Math.min(3, quantize(s.startSpeedMph + 0.1, 0.1)) })
            }
          >
            +
          </HoldButton>
        </div>
      </Row>

      <Row
        label="Lowest incline"
        hint="Precor lists −3 % decline for the TRM 885. Set 0 % if your deck doesn't go below flat."
      >
        <Segmented
          value={String(s.minInclinePct)}
          options={[
            ['-3', '−3 %'],
            ['0', '0 %'],
          ]}
          onChange={(v) => s.update({ minInclinePct: Number(v) })}
        />
      </Row>

      <Row
        label="Lap on Run and Recover"
        hint="On the Charts view, tapping Run or Recover also splits a lap."
      >
        <Segmented
          value={s.lapOnPresetTap ? 'on' : 'off'}
          options={[
            ['on', 'On'],
            ['off', 'Off'],
          ]}
          onChange={(v) => s.update({ lapOnPresetTap: v === 'on' })}
        />
      </Row>

      <Row
        label="Auto-lap"
        hint="Splits a lap every set distance, in every activity. Counts from the last split, so a manual split restarts it."
      >
        <Segmented
          value={s.autoLap ? 'on' : 'off'}
          options={[
            ['on', 'On'],
            ['off', 'Off'],
          ]}
          onChange={(v) => s.update({ autoLap: v === 'on' })}
        />
      </Row>

      <Row
        label="Auto-lap distance"
        hint={s.autoLap ? 'In your distance unit, so 1 mi becomes 1 km if you switch to kilometers.' : 'Auto-lap is off.'}
      >
        <div className={styles.autoLapDistance}>
          <div className={styles.stepper}>
            <HoldButton
              className={styles.stepperButton}
              aria-label="Shorter auto-lap distance"
              disabled={!s.autoLap || s.autoLapDistance <= AUTO_LAP_MIN}
              onTrigger={() => s.update({ autoLapDistance: stepAutoLap(s.autoLapDistance, -1) })}
            >
              −
            </HoldButton>
            <span className={`${styles.stepperValue} num`}>
              {s.autoLapDistance.toFixed(2)} {s.distanceUnit}
            </span>
            <HoldButton
              className={styles.stepperButton}
              aria-label="Longer auto-lap distance"
              disabled={!s.autoLap || s.autoLapDistance >= AUTO_LAP_MAX}
              onTrigger={() => s.update({ autoLapDistance: stepAutoLap(s.autoLapDistance, 1) })}
            >
              +
            </HoldButton>
          </div>
          {s.autoLap && (
            <Segmented
              value={String(s.autoLapDistance)}
              options={(s.distanceUnit === 'mi' ? [0.25, 0.5, 1] : [0.4, 0.5, 1]).map(
                (d) => [String(d), `${d} ${s.distanceUnit}`] as [string, string],
              )}
              onChange={(v) => s.update({ autoLapDistance: Number(v) })}
            />
          )}
        </div>
      </Row>

      <Row label="Reset" hint="Restores presets, fields and units to their defaults.">
        <button
          type="button"
          className={styles.action}
          disabled={workoutActive}
          onClick={() => s.resetToDefaults()}
        >
          Reset to defaults
        </button>
      </Row>
    </Sheet>
  )
}

const AUTO_LAP_MIN = 0.05
const AUTO_LAP_MAX = 10

/** ±0.05 in the display unit, kept on the 0.05 grid. */
function stepAutoLap(value: number, dir: 1 | -1): number {
  const next = Math.round((value + dir * 0.05) * 20) / 20
  return Math.min(AUTO_LAP_MAX, Math.max(AUTO_LAP_MIN, next))
}

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className={styles.row}>
      <div>
        <div className={styles.rowLabel}>{label}</div>
        {hint && <div className={styles.rowHint}>{hint}</div>}
      </div>
      {children}
    </div>
  )
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T
  options: [T, string][]
  onChange: (v: T) => void
}) {
  return (
    <div className={styles.segmented} role="radiogroup">
      {options.map(([v, label]) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={value === v}
          className={styles.segment}
          onClick={() => onChange(v)}
        >
          {label}
        </button>
      ))}
    </div>
  )
}
