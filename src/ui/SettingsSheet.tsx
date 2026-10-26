import type { ReactNode } from 'react'
import { quantize } from '../treadmill/limits'
import {
  AUTO_LAP_LIMITS,
  AUTO_LAP_PICKS,
  convertAutoLap,
  formatAutoLap,
  stepAutoLap,
} from '../settings/autoLap'
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
        hint={
          s.autoLap
            ? 'Has its own unit, so you can run in miles and still split every 400 m. Changing distance units carries the number across: 1 mi becomes 1000 m.'
            : 'Auto-lap is off.'
        }
      >
        <div className={styles.autoLapDistance}>
          <Segmented
            value={s.autoLapUnit}
            options={[
              ['mi', 'Miles'],
              ['m', 'Meters'],
            ]}
            onChange={(unit) =>
              s.update({
                autoLapUnit: unit,
                autoLapDistance: convertAutoLap(s.autoLapDistance, s.autoLapUnit, unit),
              })
            }
            disabled={!s.autoLap}
            label="Auto-lap unit"
          />
          <div className={styles.stepper}>
            <HoldButton
              className={styles.stepperButton}
              aria-label="Shorter auto-lap distance"
              disabled={!s.autoLap || s.autoLapDistance <= AUTO_LAP_LIMITS[s.autoLapUnit].min}
              onTrigger={() =>
                s.update({ autoLapDistance: stepAutoLap(s.autoLapDistance, s.autoLapUnit, -1) })
              }
            >
              −
            </HoldButton>
            <span className={`${styles.stepperValue} num`}>
              {formatAutoLap(s.autoLapDistance, s.autoLapUnit)}
            </span>
            <HoldButton
              className={styles.stepperButton}
              aria-label="Longer auto-lap distance"
              disabled={!s.autoLap || s.autoLapDistance >= AUTO_LAP_LIMITS[s.autoLapUnit].max}
              onTrigger={() =>
                s.update({ autoLapDistance: stepAutoLap(s.autoLapDistance, s.autoLapUnit, 1) })
              }
            >
              +
            </HoldButton>
          </div>
          {s.autoLap && (
            <Segmented
              value={String(s.autoLapDistance)}
              options={AUTO_LAP_PICKS[s.autoLapUnit].map(
                (d) => [String(d), `${d} ${s.autoLapUnit}`] as [string, string],
              )}
              onChange={(v) => s.update({ autoLapDistance: Number(v) })}
              label="Auto-lap quick picks"
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
  disabled,
  label,
}: {
  value: T
  options: [T, string][]
  onChange: (v: T) => void
  disabled?: boolean
  label?: string
}) {
  return (
    <div className={styles.segmented} role="radiogroup" aria-label={label}>
      {options.map(([v, text]) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={value === v}
          className={styles.segment}
          disabled={disabled}
          onClick={() => onChange(v)}
        >
          {text}
        </button>
      ))}
    </div>
  )
}
