import type { ReactNode } from 'react'
import { HoldButton } from '../HoldButton'
import styles from './controls.module.css'

/** A labelled value with −/+ buttons on each side (hold to repeat). */
export function Stepper(props: {
  label: string
  value: ReactNode
  note?: ReactNode
  /** Buttons, e.g. [['−1:00', -60], ['−0:05', -5]] on the left, pluses on the right. */
  down: [string, number][]
  up: [string, number][]
  onStep: (delta: number) => void
  disabled?: boolean
}) {
  return (
    <div className={styles.field} data-disabled={props.disabled ?? false}>
      <span className={styles.label}>{props.label}</span>
      <div className={styles.stepper}>
        {props.down.map(([text, d]) => (
          <HoldButton
            key={text}
            className={styles.stepButton}
            aria-label={`${props.label} ${text}`}
            disabled={props.disabled}
            onTrigger={() => props.onStep(d)}
          >
            {text}
          </HoldButton>
        ))}
        <span className={`${styles.value} num`}>{props.value}</span>
        {props.up.map(([text, d]) => (
          <HoldButton
            key={text}
            className={styles.stepButton}
            aria-label={`${props.label} ${text}`}
            disabled={props.disabled}
            onTrigger={() => props.onStep(d)}
          >
            {text}
          </HoldButton>
        ))}
      </div>
      {props.note && <span className={styles.note}>{props.note}</span>}
    </div>
  )
}

export interface Choice<T extends string> {
  value: T
  label: string
  disabled?: boolean
}

/** One-of-several picker. */
export function Choices<T extends string>(props: {
  label?: string
  value: T
  options: Choice<T>[]
  onChange: (v: T) => void
  note?: ReactNode
}) {
  return (
    <div className={styles.field}>
      {props.label && <span className={styles.label}>{props.label}</span>}
      <div className={styles.choices} role="radiogroup" aria-label={props.label}>
        {props.options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={props.value === o.value}
            disabled={o.disabled}
            className={styles.choice}
            onClick={() => props.onChange(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
      {props.note && <span className={styles.note}>{props.note}</span>}
    </div>
  )
}

/** A big tappable checkbox row. */
export function Check(props: {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
  note?: ReactNode
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={props.checked}
      disabled={props.disabled}
      className={styles.check}
      onClick={() => props.onChange(!props.checked)}
    >
      <span className={styles.box} aria-hidden="true" />
      <span>
        <span className={styles.checkLabel}>{props.label}</span>
        {props.note && <span className={styles.note}>{props.note}</span>}
      </span>
    </button>
  )
}

/** A titled group inside the editor. */
export function Section(props: { title: string; children: ReactNode; accent?: 'speed' | 'grade' | 'mist' }) {
  return (
    <section className={styles.section} data-accent={props.accent ?? 'mist'}>
      <h3 className={styles.sectionTitle}>{props.title}</h3>
      {props.children}
    </section>
  )
}
