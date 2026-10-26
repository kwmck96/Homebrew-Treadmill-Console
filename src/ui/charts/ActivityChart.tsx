import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { canPan, liveWindow, pannedWindow, type XWindow } from '../../charts/viewport'
import { formatPace, formatSpeed, paceUnitLabel, speedUnitLabel } from '../../lib/units'
import { type ChartRange, useSettings } from '../../settings/store'
import { useConsole } from '../../workout/store'
import styles from './ActivityChart.module.css'
import { type ChartColors, drawChart, type PlotRect } from './drawChart'

const RANGES: [ChartRange, string][] = [
  ['5', '5 min'],
  ['15', '15 min'],
  ['full', 'Full'],
]

/** Live graph of speed, incline and heart rate with lap bands. */
export function ActivityChart() {
  const record = useConsole((s) => s.workout)
  const treadmill = useConsole((s) => s.treadmill)
  const heartRate = useConsole((s) => s.heartRate)
  const unit = useSettings((s) => s.distanceUnit)
  const speedDisplay = useSettings((s) => s.speedDisplay)
  const range = useSettings((s) => s.chartRange)

  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const plotRef = useRef<PlotRect | null>(null)
  const [size, setSize] = useState({ w: 0, h: 0, dpr: 1 })
  const [fontsReady, setFontsReady] = useState(false)
  /** Right edge (ms) while the user has dragged back in time; null = following live. */
  const [panEndMs, setPanEndMs] = useState<number | null>(null)
  const dragRef = useRef<{ x: number; endMs: number } | null>(null)

  const elapsedMs = record?.elapsedMs ?? 0
  const live = liveWindow(elapsedMs, range)
  const pannable = canPan(live, range)
  const panned = pannable && panEndMs != null ? pannedWindow(live, panEndMs) : null
  const view: XWindow = panned ?? live
  const following = panned == null

  // Measure the canvas box; redraw at the device's pixel density.
  useLayoutEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const measure = () => {
      const r = el.getBoundingClientRect()
      setSize({ w: r.width, h: r.height, dpr: window.devicePixelRatio || 1 })
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // The canvas can't use the web font until it has loaded.
  useEffect(() => {
    let cancelled = false
    void document.fonts?.ready.then(() => !cancelled && setFontsReady(true))
    return () => {
      cancelled = true
    }
  }, [])

  const theme = useMemo(() => readTheme(), [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || size.w === 0) return
    const frame = requestAnimationFrame(() => {
      const w = Math.round(size.w * size.dpr)
      const h = Math.round(size.h * size.dpr)
      if (canvas.width !== w) canvas.width = w
      if (canvas.height !== h) canvas.height = h
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.setTransform(size.dpr, 0, 0, size.dpr, 0, 0)
      plotRef.current = drawChart(ctx, size.w, size.h, {
        record,
        window: view,
        unit,
        showNow: following && record?.status === 'running',
        colors: theme.colors,
        fontPx: theme.fontPx,
        fontFamily: theme.fontFamily,
      })
    })
    return () => cancelAnimationFrame(frame)
    // `view` is derived from these; listing its fields avoids redraws from
    // a new object identity every render.
  }, [record, view.startMs, view.endMs, size, unit, following, theme, fontsReady]) // eslint-disable-line react-hooks/exhaustive-deps

  const setRange = (r: ChartRange) => {
    setPanEndMs(null)
    useSettings.getState().update({ chartRange: r })
  }

  // Drag to scroll back through the workout (5- and 15-min ranges).
  const onPointerDown = (e: React.PointerEvent) => {
    if (!pannable) return
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      /* synthetic pointer */
    }
    dragRef.current = { x: e.clientX, endMs: view.endMs }
  }
  const onPointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current
    const plot = plotRef.current
    if (!drag || !plot) return
    const msPerPx = (view.endMs - view.startMs) / plot.width
    const next = pannedWindow(live, drag.endMs - (e.clientX - drag.x) * msPerPx)
    setPanEndMs(next ? next.endMs : null)
  }
  const endDrag = () => {
    dragRef.current = null
  }

  const showPace = speedDisplay === 'pace'
  const speed = treadmill.actualSpeedMph

  return (
    <section className={styles.chart} aria-label="Workout chart">
      <header className={styles.header}>
        <div className={styles.legend}>
          <span className={styles.key} data-series="speed">
            <span className={`${styles.keyValue} num`}>
              {showPace ? formatPace(speed, unit) : formatSpeed(speed, unit)}
            </span>
            {showPace ? paceUnitLabel(unit) : speedUnitLabel(unit)}
          </span>
          <span className={styles.key} data-series="grade">
            <span className={`${styles.keyValue} num`}>
              {treadmill.actualInclinePct.toFixed(1)}
            </span>
            % incline
          </span>
          <span className={styles.key} data-series="heart">
            <span className={`${styles.keyValue} num`}>{heartRate.bpm ?? '--'}</span>
            bpm
          </span>
        </div>

        {!following && (
          <button type="button" className={styles.live} onClick={() => setPanEndMs(null)}>
            Back to live
          </button>
        )}

        <div className={styles.ranges} role="radiogroup" aria-label="Chart time range">
          {RANGES.map(([r, label]) => (
            <button
              key={r}
              type="button"
              role="radio"
              aria-checked={range === r}
              className={styles.range}
              onClick={() => setRange(r)}
            >
              {label}
            </button>
          ))}
        </div>
      </header>

      <div
        ref={wrapRef}
        className={styles.canvasWrap}
        data-pannable={pannable}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onLostPointerCapture={endDrag}
      >
        <canvas ref={canvasRef} className={styles.canvas} />
      </div>
    </section>
  )
}

/** Read the design tokens from CSS so the canvas matches the rest of the UI. */
function readTheme(): { colors: ChartColors; fontPx: number; fontFamily: string } {
  const root = getComputedStyle(document.documentElement)
  const v = (name: string) => root.getPropertyValue(name).trim()
  return {
    colors: {
      speed: v('--speed'),
      grade: v('--grade'),
      heart: v('--heart'),
      text: v('--chalk'),
      mist: v('--mist'),
      night: v('--night'),
      grid: 'rgb(143 166 189 / 0.16)',
      // Alternating lap bands: low-opacity greys.
      bandA: 'rgb(200 208 216 / 0.05)',
      bandB: 'rgb(200 208 216 / 0.11)',
      lapLine: 'rgb(200 208 216 / 0.35)',
    },
    fontPx: parseFloat(root.fontSize) || 16,
    fontFamily: v('--font') || 'system-ui, sans-serif',
  }
}
