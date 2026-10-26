import { useMemo, useRef, useState } from 'react'
import { type DistanceUnit, formatDuration, METERS_PER_MILE } from '../../lib/units'
import { BLOCK_LABELS, BLOCK_ORDER } from '../../plan/defaults'
import { type Estimate, estimateByBlock, estimateSteps } from '../../plan/estimate'
import { expandPlan } from '../../plan/expand'
import { describeBlock, formatElevation } from '../../plan/format'
import { useBuilder } from '../../plan/store'
import type { BlockType } from '../../plan/types'
import { formatAutoLap } from '../../settings/autoLap'
import { useSettings } from '../../settings/store'
import { Dialog } from '../Dialog'
import { BlockEditor } from './BlockEditor'
import { Check } from './controls'
import styles from './BuilderView.module.css'
import { LibrarySheet, SaveDialog } from './Library'

/** Colour cue per element: hard running, hills, easy running, standing/walking. */
const ACCENT: Record<BlockType, 'speed' | 'grade' | 'mist' | 'line'> = {
  warmup: 'mist',
  strides: 'speed',
  steady: 'speed',
  intervals: 'speed',
  nested: 'speed',
  hills: 'grade',
  rest: 'line',
  activeRecovery: 'line',
  cooldown: 'mist',
}

type DragSource = { kind: 'palette'; type: BlockType } | { kind: 'block'; index: number }
interface Press {
  source: DragSource
  label: string
  x: number
  y: number
  dragging: boolean
}

/** Movement (px) before a press on a palette tile becomes a drag. */
const DRAG_THRESHOLD = 8

export function BuilderView() {
  const builder = useBuilder()
  const { plan, selectedId } = builder
  const unit = useSettings((s) => s.distanceUnit)
  const maxHr = useSettings((s) => s.maxHr)
  const restHr = useSettings((s) => s.restHr)
  const autoLap = useSettings((s) => s.autoLap)
  const autoLapDistance = useSettings((s) => s.autoLapDistance)
  const autoLapUnit = useSettings((s) => s.autoLapUnit)

  const steps = useMemo(() => expandPlan(plan, { maxHr, restHr }), [plan, maxHr, restHr])
  const total = useMemo(() => estimateSteps(steps), [steps])
  const perBlock = useMemo(() => estimateByBlock(steps), [steps])
  const selectedIndex = plan.blocks.findIndex((b) => b.id === selectedId)
  const selected = selectedIndex >= 0 ? plan.blocks[selectedIndex] : null
  // For the off-treadmill warning: the speed of the step after the selected block.
  const nextSpeed = selected
    ? steps.find((s) => s.blockIndex > selectedIndex && s.kind !== 'rest')?.speedMph
    : undefined

  const [dialog, setDialog] = useState<null | 'reset' | 'start' | 'rename' | 'save' | 'library'>(null)

  // ---- drag and drop -----------------------------------------------------
  const listRef = useRef<HTMLOListElement>(null)
  const pressRef = useRef<Press | null>(null)
  const [drag, setDrag] = useState<{ label: string; x: number; y: number; over: number | null; from: number | null } | null>(null)

  const insertionIndex = (x: number, y: number): number | null => {
    const list = listRef.current
    if (!list) return null
    const r = list.getBoundingClientRect()
    if (x < r.left || x > r.right || y < r.top - 30 || y > r.bottom + 30) return null
    // Gentle auto-scroll near the list's edges.
    if (y < r.top + 40) list.scrollTop -= 12
    else if (y > r.bottom - 40) list.scrollTop += 12
    let i = 0
    for (const card of list.querySelectorAll<HTMLElement>('[data-card]')) {
      const c = card.getBoundingClientRect()
      if (y > c.top + c.height / 2) i++
    }
    return i
  }

  const beginPress = (e: React.PointerEvent, source: DragSource, label: string, immediate: boolean) => {
    if (e.button !== 0) return
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      /* synthetic pointer */
    }
    pressRef.current = { source, label, x: e.clientX, y: e.clientY, dragging: immediate }
    if (immediate) {
      setDrag({
        label,
        x: e.clientX,
        y: e.clientY,
        over: insertionIndex(e.clientX, e.clientY),
        from: source.kind === 'block' ? source.index : null,
      })
    }
  }

  const movePress = (e: React.PointerEvent) => {
    const p = pressRef.current
    if (!p) return
    if (!p.dragging && Math.hypot(e.clientX - p.x, e.clientY - p.y) > DRAG_THRESHOLD) p.dragging = true
    if (!p.dragging) return
    setDrag({
      label: p.label,
      x: e.clientX,
      y: e.clientY,
      over: insertionIndex(e.clientX, e.clientY),
      from: p.source.kind === 'block' ? p.source.index : null,
    })
  }

  const endPress = (e: React.PointerEvent) => {
    const p = pressRef.current
    pressRef.current = null
    setDrag(null)
    if (!p) return
    if (!p.dragging) {
      // A tap on a palette tile appends that element.
      if (p.source.kind === 'palette') builder.addBlock(p.source.type)
      return
    }
    const over = insertionIndex(e.clientX, e.clientY)
    if (over == null) return
    if (p.source.kind === 'palette') builder.addBlock(p.source.type, over)
    else builder.moveBlock(p.source.index, over > p.source.index ? over - 1 : over)
  }

  const cancelPress = () => {
    pressRef.current = null
    setDrag(null)
  }

  const pressHandlers = { onPointerMove: movePress, onPointerUp: endPress, onPointerCancel: cancelPress }

  // A drop line between cards, hidden where a move wouldn't change anything.
  const showLineAt = (i: number) =>
    drag != null && drag.over === i && !(drag.from != null && (i === drag.from || i === drag.from + 1))

  return (
    <main className={styles.view}>
      <nav className={styles.palette} aria-label="Workout elements">
        <h2 className={styles.paletteTitle}>Add</h2>
        {BLOCK_ORDER.map((type) => (
          <button
            key={type}
            type="button"
            className={styles.tile}
            data-accent={ACCENT[type]}
            onPointerDown={(e) => beginPress(e, { kind: 'palette', type }, BLOCK_LABELS[type], false)}
            {...pressHandlers}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                builder.addBlock(type)
              }
            }}
          >
            {BLOCK_LABELS[type]}
          </button>
        ))}
        <p className={styles.paletteHint}>Tap to add at the end, or drag into place.</p>
      </nav>

      <section className={styles.workout} aria-label="Workout">
        <header className={styles.workoutHeader}>
          <button type="button" className={styles.name} onClick={() => setDialog('rename')}>
            {plan.name}
            <span className={styles.rename}>Rename</span>
          </button>
          {builder.dirty && builder.libraryId && <span className={styles.unsaved}>Unsaved changes</span>}
        </header>

        <ol ref={listRef} className={styles.list}>
          {plan.blocks.length === 0 && !drag && (
            <li className={styles.empty}>
              Your workout is empty. Tap an element on the left to add it, or drag it here.
            </li>
          )}
          {plan.blocks.map((b, i) => (
            <BlockCard
              key={b.id}
              index={i}
              title={BLOCK_LABELS[b.type]}
              summary={describeBlock(b, unit)}
              estimate={perBlock.get(b.id)}
              unit={unit}
              accent={ACCENT[b.type]}
              selected={b.id === selectedId}
              dragging={drag?.from === i}
              lineBefore={showLineAt(i)}
              onSelect={() => builder.select(b.id === selectedId ? null : b.id)}
              onHandleDown={(e) => beginPress(e, { kind: 'block', index: i }, BLOCK_LABELS[b.type], true)}
              handleProps={pressHandlers}
            />
          ))}
          {showLineAt(plan.blocks.length) && <li className={styles.dropLine} aria-hidden="true" />}
        </ol>
        <div className={styles.autoLap}>
          <Check
            label="Disable auto-lap"
            checked={plan.disableAutoLap ?? false}
            onChange={builder.setDisableAutoLap}
            note={
              autoLap
                ? `Settings: every ${formatAutoLap(autoLapDistance, autoLapUnit)}. Steps always split.`
                : 'Auto-lap is off in Settings.'
            }
          />
        </div>
      </section>

      <BlockEditor block={selected} unit={unit} nextSpeedMph={nextSpeed} />

      <footer className={styles.footer}>
        <Totals estimate={total} unit={unit} />
        <div className={styles.actions}>
          <button type="button" className={styles.action} onClick={() => setDialog('library')}>
            Library
          </button>
          <button
            type="button"
            className={styles.action}
            disabled={plan.blocks.length === 0}
            onClick={() => setDialog('save')}
          >
            {builder.libraryId ? 'Save' : 'Add to Library'}
          </button>
          <button
            type="button"
            className={styles.action}
            disabled={plan.blocks.length === 0}
            onClick={() => setDialog('reset')}
          >
            Reset
          </button>
          <button
            type="button"
            className={styles.start}
            disabled
            title="The workout runner arrives in the next update"
            onClick={() => setDialog('start')}
          >
            Start workout
            <small>Coming in the next update</small>
          </button>
        </div>
      </footer>

      {drag && (
        <div className={styles.ghost} style={{ left: drag.x + 14, top: drag.y + 14 }} aria-hidden="true">
          {drag.label}
        </div>
      )}

      {dialog === 'reset' && (
        <Dialog
          title="Are you sure you want to reset?"
          actions={[
            { label: 'Cancel', onClick: () => setDialog(null) },
            {
              label: 'Reset',
              tone: 'danger',
              onClick: () => {
                builder.reset()
                setDialog(null)
              },
            },
          ]}
        >
          <p>This clears every block from the builder. Workouts saved in the library aren't affected.</p>
        </Dialog>
      )}
      {dialog === 'rename' && (
        <SaveDialog
          title="Name this workout"
          initial={plan.name}
          confirmLabel="Rename"
          onCancel={() => setDialog(null)}
          onConfirm={(name) => {
            builder.rename(name)
            setDialog(null)
          }}
        />
      )}
      {dialog === 'save' && <SaveFlow onDone={() => setDialog(null)} />}
      {dialog === 'library' && <LibrarySheet onClose={() => setDialog(null)} />}
    </main>
  )
}

function BlockCard(props: {
  index: number
  title: string
  summary: string
  estimate: Estimate | undefined
  unit: DistanceUnit
  accent: string
  selected: boolean
  dragging: boolean
  lineBefore: boolean
  onSelect: () => void
  onHandleDown: (e: React.PointerEvent) => void
  handleProps: Record<string, (e: React.PointerEvent) => void>
}) {
  return (
    <>
      {props.lineBefore && <li className={styles.dropLine} aria-hidden="true" />}
      <li className={styles.card} data-card data-accent={props.accent} data-selected={props.selected} data-dragging={props.dragging}>
        <button
          type="button"
          className={styles.handle}
          aria-label={`Move ${props.title}`}
          onPointerDown={props.onHandleDown}
          {...props.handleProps}
        >
          <span aria-hidden="true" />
        </button>
        <button type="button" className={styles.cardBody} onClick={props.onSelect} aria-pressed={props.selected}>
          <span className={styles.cardTitle}>{props.title}</span>
          <span className={styles.cardSummary}>{props.summary}</span>
          {props.estimate && <BlockEstimate e={props.estimate} unit={props.unit} />}
        </button>
      </li>
    </>
  )
}

function BlockEstimate({ e, unit }: { e: Estimate; unit: DistanceUnit }) {
  const time = e.unknownTime ? null : `${e.timeIsMax ? 'up to ' : ''}${formatDuration(e.timeSec * 1000)}`
  const dist = e.unknownDistance ? null : formatMiles(e.distanceM, unit)
  const net = e.elevGainM - e.elevLossM
  const elev = e.hasIncline && !e.unknownElevation ? `${net >= 0 ? '+' : '−'}${formatElevation(Math.abs(net), unit)}` : null
  return (
    <span className={`${styles.cardEstimate} num`}>
      <span>{time ?? 'Time —'}</span>
      <span>{dist ?? 'Distance —'}</span>
      {e.hasIncline && <span data-sign={net >= 0 ? 'up' : 'down'}>{elev ?? 'Elevation —'}</span>}
    </span>
  )
}

function formatMiles(m: number, unit: DistanceUnit): string {
  return unit === 'mi' ? `${(m / METERS_PER_MILE).toFixed(2)} mi` : `${(m / 1000).toFixed(2)} km`
}

/** Estimated totals: time, distance, and elevation if any step is inclined. */
function Totals({ estimate: e, unit }: { estimate: Estimate; unit: DistanceUnit }) {
  const net = e.elevGainM - e.elevLossM
  const notEstimated = Math.max(e.unknownTime, e.unknownDistance)
  return (
    <div className={styles.totals}>
      <div className={styles.total}>
        <span className={styles.totalLabel}>Est. time</span>
        <span className={`${styles.totalValue} num`}>
          {e.timeIsMax && <small>up to </small>}
          {formatDuration(e.timeSec * 1000)}
        </span>
      </div>
      <div className={styles.total}>
        <span className={styles.totalLabel}>Est. distance</span>
        <span className={`${styles.totalValue} num`}>{formatMiles(e.distanceM, unit)}</span>
      </div>
      {e.hasIncline && (
        <div className={styles.total}>
          <span className={styles.totalLabel}>Est. elevation</span>
          <span className={styles.elevation}>
            <span className={styles.elevStack}>
              <span className={`${styles.gain} num`}>▲ {formatElevation(e.elevGainM, unit)}</span>
              <span className={`${styles.loss} num`}>▼ {formatElevation(e.elevLossM, unit)}</span>
            </span>
            <span className={`${styles.totalValue} num`} data-sign={net >= 0 ? 'up' : 'down'}>
              {net >= 0 ? '+' : '−'}
              {formatElevation(Math.abs(net), unit)}
            </span>
          </span>
        </div>
      )}
      {notEstimated > 0 && (
        <span className={styles.totalNote}>
          + {notEstimated} step{notEstimated === 1 ? '' : 's'} not estimated (heart rate or effort targets)
        </span>
      )}
    </div>
  )
}

/** "Add to Library" (new) or "Save" / "Save as new" (loaded from library). */
function SaveFlow({ onDone }: { onDone: () => void }) {
  const { plan, libraryId, markSaved } = useBuilder()
  const save = async (name: string, asNew: boolean) => {
    const { saveToLibrary } = await import('../../plan/library')
    const id = await saveToLibrary(plan, name, asNew ? undefined : (libraryId ?? undefined))
    markSaved(id, name)
    onDone()
  }
  return (
    <SaveDialog
      title={libraryId ? 'Save to library' : 'Add to library'}
      initial={plan.name === 'Untitled workout' ? '' : plan.name}
      confirmLabel={libraryId ? 'Save' : 'Add to Library'}
      secondaryLabel={libraryId ? 'Save as new' : undefined}
      onCancel={onDone}
      onConfirm={(name) => void save(name, false)}
      onSecondary={(name) => void save(name, true)}
    />
  )
}
