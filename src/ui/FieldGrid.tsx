import { useState } from 'react'
import { useSettings } from '../settings/store'
import { FIELDS, FIELDS_BY_ID, type FieldContext, type FieldId } from '../workout/fields'
import styles from './FieldGrid.module.css'
import { Sheet } from './Sheet'

/** The configurable data fields (M7). Tap a tile to choose what it shows. */
export function FieldGrid({ ctx }: { ctx: FieldContext }) {
  const dataFields = useSettings((s) => s.dataFields)
  const setDataField = useSettings((s) => s.setDataField)
  const [picking, setPicking] = useState<number | null>(null)

  return (
    <>
      <div className={styles.grid}>
        {dataFields.map((id, slot) => {
          const def = FIELDS_BY_ID[id] ?? FIELDS_BY_ID.elapsed
          const v = def.compute(ctx)
          return (
            <button
              key={slot}
              type="button"
              className={styles.tile}
              onClick={() => setPicking(slot)}
              aria-label={`${def.label}: ${v.value} ${v.unit ?? ''}. Tap to change field.`}
            >
              <span className={styles.label}>{def.label}</span>
              <span className={styles.valueRow}>
                <span className={`${styles.value} num`}>{v.value}</span>
                {v.unit && <span className={styles.unit}>{v.unit}</span>}
              </span>
            </button>
          )
        })}
      </div>

      {picking !== null && (
        <Sheet title={`Choose field ${picking + 1}`} onClose={() => setPicking(null)}>
          <div className={styles.picker}>
            {FIELDS.map((f) => (
              <button
                key={f.id}
                type="button"
                className={styles.option}
                data-selected={dataFields[picking] === f.id}
                onClick={() => {
                  setDataField(picking, f.id as FieldId)
                  setPicking(null)
                }}
              >
                {f.label}
              </button>
            ))}
          </div>
        </Sheet>
      )}
    </>
  )
}
