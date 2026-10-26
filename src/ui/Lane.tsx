import type { CSSProperties, ReactNode } from 'react'
import type { Preset } from '../settings/store'
import { HoldButton } from './HoldButton'
import styles from './Lane.module.css'
import { useTapOrHold } from './useTapOrHold'

export interface StepDef {
  label: string
  delta: number
}

interface LaneProps {
  title: string
  accent: 'speed' | 'grade'
  /** The big number: what the treadmill is actually doing. */
  readout: ReactNode
  readoutUnit: string
  /** Dims the readout when there's nothing meaningful to show (belt stopped). */
  idle?: boolean
  /** Small line under the readout (e.g. speed when pace is primary). */
  secondary?: ReactNode
  /** Commanded value, formatted. */
  target: string
  /** True while actual hasn't caught up to target (M5). */
  ramping: boolean
  presets: Preset[]
  formatPreset: (value: number) => { main: string; sub?: string }
  activePresetValue: number | null
  /** Tap: go to the preset (and split a lap if lapOnTap). */
  onPresetTap: (id: string) => void
  /** Hold: save the current setting into the preset. */
  onPresetHold: (id: string) => void
  lapOnTap: boolean
  onToggleLapOnTap: () => void
  editing: boolean
  onToggleEditing: () => void
  onPresetChange: (id: string, value: number) => void
  presetStep: number
  onUseCurrent: (id: string) => void
  steps: StepDef[]
  stepUnit: string
  onStep: (delta: number) => void
  /** Controls only work while a workout is running and the belt is moving. */
  enabled: boolean
}

export function Lane(props: LaneProps) {
  const accentStyle = {
    '--accent': `var(--${props.accent})`,
    '--accent-ink': `var(--${props.accent}-ink)`,
  } as CSSProperties

  return (
    <section className={styles.lane} style={accentStyle} aria-label={props.title}>
      <header className={styles.header}>
        <h2 className={styles.title}>{props.title}</h2>
        <button
          type="button"
          role="switch"
          aria-checked={props.lapOnTap}
          aria-label={`Lap when tapping a ${props.title.toLowerCase()} preset`}
          className={styles.lapToggle}
          onClick={props.onToggleLapOnTap}
        >
          Lap on tap
          <span className={styles.switch} aria-hidden="true" />
        </button>
        <button
          type="button"
          className={styles.editToggle}
          aria-pressed={props.editing}
          aria-label={props.editing ? 'Done editing presets' : `Edit ${props.title.toLowerCase()} presets`}
          onClick={props.onToggleEditing}
        >
          {props.editing ? 'Done' : 'Edit'}
        </button>
      </header>

      <div className={styles.presets}>
        {props.presets.map((p) => {
          const f = props.formatPreset(p.value)
          if (props.editing) {
            return (
              <div key={p.id} className={styles.presetEdit}>
                <span className={styles.presetLabel}>{p.label}</span>
                <span className={`${styles.presetMain} num`}>{f.main}</span>
                <div className={styles.presetEditRow}>
                  <HoldButton
                    className={styles.miniStep}
                    aria-label={`Lower ${p.label}`}
                    onTrigger={() => props.onPresetChange(p.id, p.value - props.presetStep)}
                  >
                    −
                  </HoldButton>
                  <HoldButton
                    className={styles.miniStep}
                    aria-label={`Raise ${p.label}`}
                    onTrigger={() => props.onPresetChange(p.id, p.value + props.presetStep)}
                  >
                    +
                  </HoldButton>
                </div>
                <button
                  type="button"
                  className={styles.useCurrent}
                  onClick={() => props.onUseCurrent(p.id)}
                >
                  Set to current
                </button>
              </div>
            )
          }
          return (
            <PresetButton
              key={p.id}
              preset={p}
              main={f.main}
              sub={f.sub}
              active={props.activePresetValue === p.value}
              canTap={props.enabled}
              onTap={() => props.onPresetTap(p.id)}
              onHold={() => props.onPresetHold(p.id)}
            />
          )
        })}
      </div>

      <div className={styles.readoutBlock}>
        <div className={styles.readoutRow}>
          <span className={`${styles.readout} num`} data-idle={props.idle ?? false}>
            {props.readout}
          </span>
          <span className={styles.readoutUnit}>{props.readoutUnit}</span>
        </div>
        <div className={styles.meta}>
          <span className={styles.target} data-ramping={props.ramping}>
            Target <span className="num">{props.target}</span>
          </span>
          {props.secondary && <span className={styles.secondary}>{props.secondary}</span>}
        </div>
      </div>

      <div className={styles.steps} data-count={props.steps.length}>
        {props.steps.map((s) => (
          <HoldButton
            key={s.label}
            className={styles.step}
            data-direction={s.delta > 0 ? 'up' : 'down'}
            disabled={!props.enabled}
            aria-label={`${s.delta > 0 ? 'Increase' : 'Decrease'} ${props.title.toLowerCase()} by ${Math.abs(s.delta)} ${props.stepUnit}`}
            onTrigger={() => props.onStep(s.delta)}
          >
            <span className="num">{s.label}</span>
          </HoldButton>
        ))}
      </div>
    </section>
  )
}

/**
 * Tap to go to the preset; hold to save the current setting into it. Stays
 * pressable while the belt is stopped so presets can be saved before a run.
 */
function PresetButton(props: {
  preset: Preset
  main: string
  sub?: string
  active: boolean
  canTap: boolean
  onTap: () => void
  onHold: () => void
}) {
  const { holding, saved, handlers } = useTapOrHold(props)
  return (
    <button
      type="button"
      className={styles.preset}
      data-active={props.active}
      data-can-tap={props.canTap}
      data-holding={holding}
      data-saved={saved}
      aria-label={`${props.preset.label}, ${props.main}. Tap to go, hold to set to the current value.`}
      {...handlers}
    >
      <span className={styles.presetLabel}>{saved ? 'Saved' : props.preset.label}</span>
      <span className={`${styles.presetMain} num`}>{props.main}</span>
      {props.sub && <span className={`${styles.presetSub} num`}>{props.sub}</span>}
      <span className={styles.presetHelp}>hold to set</span>
      <span className={styles.presetProgress} aria-hidden="true" />
    </button>
  )
}
