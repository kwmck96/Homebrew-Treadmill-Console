import { useEffect, useState } from 'react'
import { formatDuration, METERS_PER_MILE } from '../../lib/units'
import { estimateSteps } from '../../plan/estimate'
import { expandPlan } from '../../plan/expand'
import { deleteFromLibrary, type LibraryEntry, listLibrary } from '../../plan/library'
import { useBuilder } from '../../plan/store'
import { useSettings } from '../../settings/store'
import { Dialog } from '../Dialog'
import { Sheet } from '../Sheet'
import styles from './Library.module.css'

/** Name a workout (rename, add to library, save). Uses the on-screen keyboard. */
export function SaveDialog(props: {
  title: string
  initial: string
  confirmLabel: string
  secondaryLabel?: string
  onConfirm: (name: string) => void
  onSecondary?: (name: string) => void
  onCancel: () => void
}) {
  const [name, setName] = useState(props.initial)
  const clean = name.trim() || 'Untitled workout'
  return (
    <Dialog
      title={props.title}
      actions={[
        { label: 'Cancel', onClick: props.onCancel },
        ...(props.secondaryLabel && props.onSecondary
          ? [{ label: props.secondaryLabel, onClick: () => props.onSecondary!(clean) }]
          : []),
        { label: props.confirmLabel, tone: 'primary' as const, onClick: () => props.onConfirm(clean) },
      ]}
    >
      <label className={styles.nameLabel}>
        Workout name
        <input
          className={styles.nameInput}
          value={name}
          maxLength={60}
          placeholder="e.g. Tuesday 4 × 3:00"
          autoFocus
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && props.onConfirm(clean)}
        />
      </label>
    </Dialog>
  )
}

/** Saved workouts: load into the builder or delete. */
export function LibrarySheet({ onClose }: { onClose: () => void }) {
  const [entries, setEntries] = useState<LibraryEntry[] | null>(null)
  const [confirm, setConfirm] = useState<null | { kind: 'load' | 'delete'; entry: LibraryEntry }>(null)
  const { dirty, plan, load } = useBuilder()
  const unit = useSettings((s) => s.distanceUnit)
  const maxHr = useSettings((s) => s.maxHr)
  const restHr = useSettings((s) => s.restHr)

  const refresh = () => void listLibrary().then(setEntries)
  useEffect(refresh, [])

  const doLoad = (e: LibraryEntry) => {
    load(e.plan, e.id)
    onClose()
  }

  return (
    <Sheet title="Library" onClose={onClose}>
      {entries === null ? null : entries.length === 0 ? (
        <p className={styles.empty}>No saved workouts yet. Build one, then tap Add to Library.</p>
      ) : (
        <ul className={styles.list}>
          {entries.map((e) => {
            const est = estimateSteps(expandPlan(e.plan, { maxHr, restHr }))
            const dist = unit === 'mi' ? `${(est.distanceM / METERS_PER_MILE).toFixed(2)} mi` : `${(est.distanceM / 1000).toFixed(2)} km`
            return (
              <li key={e.id} className={styles.row}>
                <div className={styles.info}>
                  <span className={styles.rowName}>{e.name}</span>
                  <span className={`${styles.rowMeta} num`}>
                    {e.plan.blocks.length} block{e.plan.blocks.length === 1 ? '' : 's'}, about{' '}
                    {formatDuration(est.timeSec * 1000)} and {dist}
                    {est.unknownTime > 0 ? ' (partly estimated)' : ''} · saved{' '}
                    {new Date(e.updatedAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                  </span>
                </div>
                <button
                  type="button"
                  className={styles.load}
                  onClick={() => (dirty && plan.blocks.length > 0 ? setConfirm({ kind: 'load', entry: e }) : doLoad(e))}
                >
                  Load
                </button>
                <button type="button" className={styles.delete} onClick={() => setConfirm({ kind: 'delete', entry: e })}>
                  Delete
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {confirm?.kind === 'load' && (
        <Dialog
          title="Replace the current workout?"
          actions={[
            { label: 'Cancel', onClick: () => setConfirm(null) },
            { label: 'Load', tone: 'primary', onClick: () => doLoad(confirm.entry) },
          ]}
        >
          <p>The workout in the builder has changes that aren't in the library.</p>
        </Dialog>
      )}
      {confirm?.kind === 'delete' && (
        <Dialog
          title={`Delete "${confirm.entry.name}"?`}
          actions={[
            { label: 'Cancel', onClick: () => setConfirm(null) },
            {
              label: 'Delete',
              tone: 'danger',
              onClick: () => {
                void deleteFromLibrary(confirm.entry.id).then(refresh)
                setConfirm(null)
              },
            },
          ]}
        >
          <p>This removes it from the library. It can't be undone.</p>
        </Dialog>
      )}
    </Sheet>
  )
}
