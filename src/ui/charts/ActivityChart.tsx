import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  beginGesture,
  cursorTime,
  endGesture,
  type Gesture,
  type GestureContext,
  type InspectState,
  LIVE,
  moveGesture,
} from '../../charts/inspect'
import { canPan, liveWindow, pannedWindow, type XWindow } from '../../charts/viewport'
import { formatPace, formatSpeed, paceUnitLabel, speedUnitLabel } from '../../lib/units'
import { type ChartRange, useSettings } from '../../settings/store'
import { useConsole } from '../../workout/store'
import styles from './ActivityChart.module.css'
import { type ChartColors, drawChart, type PlotRect } from './drawChart'

/** While running, the graph returns to live after this long untouched. */
const RETURN_AFTER_MS = 10_000

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
  /** Dragged-back view and/or scrub cursor. LIVE = following the workout. */
  const [inspect, setInspectState] = useState<InspectState>(LIVE)
  // Pointer moves can arrive faster than React re-renders; gestures read the
  // latest state from this ref rather than a possibly stale render value.
  const inspectRef = useRef<InspectState>(LIVE)
  const setInspect = (next: InspectState) => {
    inspectRef.current = next
    setInspectState(next)
  }
  const gestureRef = useRef<Gesture | null>(null)
  const [touching, setTouching] = useState(false)
  /** performance.now() of the last touch, for the return-to-live countdown. */
  const lastTouchRef = useRef(0)
  const [returnLeftMs, setReturnLeftMs] = useState(RETURN_AFTER_MS)

  const elapsedMs = record?.elapsedMs ?? 0
  const live = liveWindow(elapsedMs, range)
  const pannable = canPan(live, range)
  const panned = pannable && inspect.panEndMs != null ? pannedWindow(live, inspect.panEndMs) : null
  const view: XWindow = panned ?? live
  const following = panned == null
  const cursorMs = record ? cursorTime(inspect, view, panned != null) : null
  const inspecting = cursorMs != null || panned != null
  const running = record?.status === 'running'
  const countingDown = inspecting && running && !touching

  const backToLive = () => {
    gestureRef.current = null
    setInspect(LIVE)
  }

  // Running: return to live after 10 s untouched, with a countdown.
  useEffect(() => {
    if (!countingDown) return
    const id = setInterval(() => {
      const left = RETURN_AFTER_MS - (performance.now() - lastTouchRef.current)
      if (left <= 0) backToLive()
      else setReturnLeftMs(left)
    }, 200)
    return () => clearInterval(id)
  }, [countingDown])

  // Paused: stay put. Resuming returns to live straight away.
  useEffect(
    () =>
      useConsole.subscribe((s, prev) => {
        if (prev.workout?.status === 'paused' && s.workout?.status === 'running') backToLive()
      }),
    [],
  )

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
        showNow: following && running,
        cursorMs,
        speedDisplay,
        colors: theme.colors,
        fontPx: theme.fontPx,
        fontFamily: theme.fontFamily,
      })
    })
    return () => cancelAnimationFrame(frame)
    // `view` is derived from these; listing its fields avoids redraws from
    // a new object identity every render.
  }, [record, view.startMs, view.endMs, size, unit, following, cursorMs, speedDisplay, theme, fontsReady]) // eslint-disable-line react-hooks/exhaustive-deps

  const setRange = (r: ChartRange) => {
    backToLive()
    useSettings.getState().update({ chartRange: r })
  }

  // Gestures: drag to scroll back (5/15 min); at the start, or when nothing is
  // off-screen, tap or pull toward the start to read values under the finger.
  const gestureContext = (): GestureContext | null => {
    const plot = plotRef.current
    const wrap = wrapRef.current
    if (!plot || !wrap) return null
    const left = wrap.getBoundingClientRect().left + plot.left
    // Work out the view from the latest state, not this render's.
    const s = inspectRef.current
    const p = pannable && s.panEndMs != null ? pannedWindow(live, s.panEndMs) : null
    return { live, view: p ?? live, pannable, elapsedMs, plotLeftPx: left, plotWidthPx: plot.width }
  }
  const touch = () => {
    lastTouchRef.current = performance.now()
    setReturnLeftMs(RETURN_AFTER_MS)
  }
  const onPointerDown = (e: React.PointerEvent) => {
    const ctx = gestureContext()
    if (!ctx || !record || e.button !== 0) return
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      /* synthetic pointer */
    }
    const next = beginGesture(inspectRef.current, ctx, e.clientX)
    gestureRef.current = next.gesture
    setInspect(next.state)
    setTouching(true)
    touch()
  }
  const onPointerMove = (e: React.PointerEvent) => {
    const g = gestureRef.current
    const ctx = gestureContext()
    if (!g || !ctx) return
    const next = moveGesture(inspectRef.current, g, ctx, e.clientX)
    gestureRef.current = next.gesture
    setInspect(next.state)
    touch()
  }
  const endDrag = () => {
    const g = gestureRef.current
    const ctx = gestureContext()
    gestureRef.current = null
    setTouching(false)
    touch()
    if (g && ctx) setInspect(endGesture(inspectRef.current, g, ctx))
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

        {inspecting && (
          <button type="button" className={styles.live} onClick={backToLive}>
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
        data-pannable={pannable || inspecting}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onLostPointerCapture={endDrag}
      >
        <canvas ref={canvasRef} className={styles.canvas} />
        {countingDown && (
          <div className={styles.countdown} role="timer" aria-live="off">
            <span className={`${styles.countdownText} num`}>
              Graph returns in {Math.ceil(returnLeftMs / 1000)}
            </span>
            <span className={styles.countdownTrack}>
              <span
                className={styles.countdownFill}
                style={{ width: `${(returnLeftMs / RETURN_AFTER_MS) * 100}%` }}
              />
            </span>
          </div>
        )}
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
