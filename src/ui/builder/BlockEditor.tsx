import type { DistanceUnit } from '../../lib/units'
import { BLOCK_LABELS } from '../../plan/defaults'
import type { Block } from '../../plan/types'
import { useBuilder } from '../../plan/store'
import styles from './BlockEditor.module.css'
import { Check, Section, Stepper } from './controls'
import { paceToBeltMph } from '../../plan/expand'
import { RecoveryEditor, RestEditor, StepEditor } from './editors'

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/** The right-hand panel: edit the selected block. */
export function BlockEditor(props: {
  block: Block | null
  unit: DistanceUnit
  /** Speed the step after this block starts at (for the off-treadmill warning). */
  nextSpeedMph?: number
}) {
  const { updateBlock, removeBlock, duplicateBlock } = useBuilder()
  const b = props.block
  if (!b) {
    return (
      <aside className={styles.panel}>
        <p className={styles.empty}>Select a block to edit it.</p>
      </aside>
    )
  }
  const update = (next: Block) => updateBlock(b.id, () => next)
  const unit = props.unit

  return (
    <aside className={styles.panel} aria-label={`Edit ${BLOCK_LABELS[b.type]}`}>
      <header className={styles.header}>
        <h2 className={styles.title}>{BLOCK_LABELS[b.type]}</h2>
        <button type="button" className={styles.tool} onClick={() => duplicateBlock(b.id)}>
          Duplicate
        </button>
        <button type="button" className={styles.tool} data-tone="danger" onClick={() => removeBlock(b.id)}>
          Remove
        </button>
      </header>

      <div className={styles.body}>
        {(b.type === 'warmup' || b.type === 'steady' || b.type === 'activeRecovery' || b.type === 'cooldown') && (
          <StepEditor
            value={b.step}
            onChange={(step) => update({ ...b, step })}
            unit={unit}
            recovery={b.type !== 'steady'}
          />
        )}

        {b.type === 'rest' && (
          <RestEditor value={b.rest} onChange={(rest) => update({ ...b, rest })} unit={unit} nextSpeedMph={props.nextSpeedMph} />
        )}

        {(b.type === 'strides' || b.type === 'intervals' || b.type === 'hills') && (
          <>
            <Stepper
              label="Repeats"
              value={`${b.reps} ×`}
              down={[['−1', -1]]}
              up={[['+1', 1]]}
              onStep={(d) => update({ ...b, reps: clamp(b.reps + d, 1, 50) })}
            />
            <Section title={b.type === 'hills' ? 'Each hill' : b.type === 'strides' ? 'Each stride' : 'Each interval'} accent={b.type === 'hills' ? 'grade' : 'speed'}>
              <StepEditor value={b.work} onChange={(work) => update({ ...b, work })} unit={unit} />
            </Section>
            <RecoveryEditor
              title="Between repeats"
              value={b.recovery}
              onChange={(recovery) => update({ ...b, recovery })}
              unit={unit}
              nextSpeedMph={paceToBeltMph(b.work.paceSecPerMile)}
            />
            <Check
              label="Include rest after final interval"
              checked={b.restAfterFinal}
              onChange={(restAfterFinal) => update({ ...b, restAfterFinal })}
            />
          </>
        )}

        {b.type === 'nested' && (
          <>
            <div className={styles.pair}>
              <Stepper
                label="Sets"
                value={`${b.sets} ×`}
                down={[['−1', -1]]}
                up={[['+1', 1]]}
                onStep={(d) => update({ ...b, sets: clamp(b.sets + d, 1, 20) })}
              />
              <Stepper
                label="Repeats per set"
                value={`${b.reps} ×`}
                down={[['−1', -1]]}
                up={[['+1', 1]]}
                onStep={(d) => update({ ...b, reps: clamp(b.reps + d, 1, 30) })}
              />
            </div>
            <Section title="Each interval" accent="speed">
              <StepEditor value={b.work} onChange={(work) => update({ ...b, work })} unit={unit} />
            </Section>
            <RecoveryEditor
              title="Between repeats"
              value={b.recovery}
              onChange={(recovery) => update({ ...b, recovery })}
              unit={unit}
              nextSpeedMph={paceToBeltMph(b.work.paceSecPerMile)}
            />
            <RecoveryEditor
              title="Between sets"
              value={b.setRecovery}
              onChange={(setRecovery) => update({ ...b, setRecovery })}
              unit={unit}
              nextSpeedMph={paceToBeltMph(b.work.paceSecPerMile)}
            />
            <Check
              label="Include rest after final interval"
              checked={b.restAfterFinal}
              onChange={(restAfterFinal) => update({ ...b, restAfterFinal })}
              note="Adds a recovery after the last rep of the last set."
            />
          </>
        )}
      </div>
    </aside>
  )
}
