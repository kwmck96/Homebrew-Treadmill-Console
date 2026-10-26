import { type CSSProperties, useRef, useState } from 'react'
import { formatPace, formatSpeed, KM_PER_MILE, paceUnitLabel, speedUnitLabel } from '../../lib/units'
import { useSettings } from '../../settings/store'
import { quantize } from '../../treadmill/limits'
import { effectiveLimits, useConsole } from '../../workout/store'
import styles from './SpeedWheel.module.css'
import { tapeOffsetPx, valueFromDrag } from './wheelMath'

/** Tape spacing in CSS pixels per mph (13 px per 0.1 mph step). */
const PX_PER_MPH = 130

/**
 * A drag wheel for belt speed (Charts view). It moves only while touched:
 * no fling momentum, so a flick can't keep spinning the speed upward.
 */
export function SpeedWheel() {
  const dialMph = useConsole((s) => s.dialMph)
  const setDial = useConsole((s) => s.setDial)
  const driving = useConsole(
    (s) =>
      s.workout?.status === 'running' &&
      s.treadmill.connection === 'connected' &&
      s.treadmill.belt === 'running',
  )
  const unit = useSettings((s) => s.distanceUnit)
  const { minSpeedMph: min, maxSpeedMph: max } = effectiveLimits()

  /** Unrounded value while a finger is on the wheel; null otherwise. */
  const [dragValue, setDragValue] = useState<number | null>(null)
  const dragRef = useRef<{ x: number; start: number; last: number } | null>(null)

  const shown = dragValue ?? dialMph
  const commit = (raw: number) => {
    const v = quantize(raw, 0.1)
    const drag = dragRef.current
    if (drag && v === drag.last) return
    if (drag) drag.last = v
    setDial(v)
  }

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      /* synthetic pointer */
    }
    dragRef.current = { x: e.clientX, start: dialMph, last: dialMph }
    setDragValue(dialMph)
  }
  const onPointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current
    if (!drag) return
    const raw = valueFromDrag(drag.start, e.clientX - drag.x, PX_PER_MPH, min, max)
    setDragValue(raw)
    commit(raw)
  }
  const endDrag = () => {
    if (!dragRef.current) return
    dragRef.current = null
    setDragValue(null) // tape snaps to the committed 0.1 step
  }

  const step = (delta: number) => setDial(quantize(dialMph + delta, 0.1))

  // The tape starts at 0 so ticks land on round numbers. Ticks and labels are
  // in the display unit; the drag feel (px per mph) is the same either way.
  const factor = unit === 'mi' ? 1 : KM_PER_MILE
  const pxPerDisplayUnit = PX_PER_MPH / factor
  const labelEvery = unit === 'mi' ? 1 : 2
  const labels: number[] = []
  for (let v = labelEvery; v <= max * factor; v += labelEvery) labels.push(v)

  const tapeStyle = {
    '--offset': `${tapeOffsetPx(shown, 0, PX_PER_MPH)}px`,
    '--tenth': `${pxPerDisplayUnit / 10}px`,
    width: `${max * PX_PER_MPH}px`,
  } as CSSProperties

  return (
    <div
      className={styles.wheel}
      data-driving={driving}
      data-dragging={dragValue != null}
      role="slider"
      tabIndex={0}
      aria-label="Belt speed"
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={dialMph}
      aria-valuetext={`${formatSpeed(dialMph, unit)} ${speedUnitLabel(unit)}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onLostPointerCapture={endDrag}
      onWheel={(e) => step(e.deltaY > 0 || e.deltaX > 0 ? 0.1 : -0.1)}
      onKeyDown={(e) => {
        const big = e.shiftKey ? 1 : 0.1
        if (e.key === 'ArrowRight' || e.key === 'ArrowUp') step(big)
        else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') step(-big)
        else return
        e.preventDefault()
      }}
    >
      <div className={styles.readout}>
        <span className={`${styles.value} num`}>{formatSpeed(quantize(shown, 0.1), unit)}</span>
        <span className={styles.unit}>{speedUnitLabel(unit)}</span>
        <span className={`${styles.pace} num`}>
          {formatPace(quantize(shown, 0.1), unit)}
          {paceUnitLabel(unit)}
        </span>
      </div>

      <div className={styles.window}>
        <div className={styles.tape} style={tapeStyle}>
          {labels.map((v) => (
            <span
              key={v}
              className={`${styles.label} num`}
              style={{ left: `${v * pxPerDisplayUnit}px` }}
            >
              {v}
            </span>
          ))}
        </div>
        <div className={styles.marker} aria-hidden="true" />
      </div>

      {!driving && <span className={styles.hint}>Not moving the belt</span>}
    </div>
  )
}
