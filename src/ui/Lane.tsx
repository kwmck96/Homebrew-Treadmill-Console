import type { CSSProperties, ReactNode } from 'react'
import type { Preset } from '../settings/store'
import { HoldButton } from './HoldButton'
import styles from './Lane.module.css'

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
  onPreset: (value: number) => void
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
          className={styles.editToggle}
          aria-pressed={props.editing}
          onClick={props.onToggleEditing}
        >
          {props.editing ? 'Done' : 'Edit presets'}
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
          const active = props.activePresetValue === p.value
          return (
            <button
              key={p.id}
              type="button"
              className={styles.preset}
              data-active={active}
              disabled={!props.enabled}
              onPointerDown={(e) => {
                // Fire on touch-down for responsiveness, like the step buttons.
                if (e.button === 0 && props.enabled) props.onPreset(p.value)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') props.onPreset(p.value)
              }}
            >
              <span className={styles.presetLabel}>{p.label}</span>
              <span className={`${styles.presetMain} num`}>{f.main}</span>
              {f.sub && <span className={`${styles.presetSub} num`}>{f.sub}</span>}
            </button>
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
