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
