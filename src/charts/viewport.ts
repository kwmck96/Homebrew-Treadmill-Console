/**
 * Pure math for the Charts view's graph: which slice of time is visible,
 * how panning works, y-axis scales, and thinning long workouts down to what
 * the screen can show. No drawing here, so it's all unit-tested.
 *
 * Time on the x-axis is workout moving time (pauses don't take up space).
 */
import type { ChartRange } from '../settings/store'
import type { Sample } from '../workout/types'

export const MINUTE_MS = 60_000
/** The x-axis starts at 0–6 min. */
export const INITIAL_SPAN_MS = 6 * MINUTE_MS
/** Empty space kept ahead of "now" so the line never touches the right edge. */
export const HEADROOM_MS = 1 * MINUTE_MS

export interface XWindow {
  startMs: number
  endMs: number
}

/** How much history each range shows. */
export function historySpanMs(range: ChartRange): number {
  return range === '5' ? 5 * MINUTE_MS : range === '15' ? 15 * MINUTE_MS : Infinity
}

/**
 * The live (auto-following) window.
 *
 * - Every range starts at 0–6 min with the line growing from the left edge.
 * - Once the workout passes 5 min, the right edge stays 1 min ahead of now.
 * - "5 min" then slides a fixed 6-min window (5 min of history + headroom).
 * - "15 min" widens (zooms out) until it shows 15 min of history, then slides.
 * - "Full" keeps the left edge at 0 and zooms out indefinitely.
 */
export function liveWindow(elapsedMs: number, range: ChartRange): XWindow {
  const endMs = Math.max(INITIAL_SPAN_MS, elapsedMs + HEADROOM_MS)
  const startMs = Math.max(0, endMs - (historySpanMs(range) + HEADROOM_MS))
  return { startMs, endMs }
}

/** Panning only makes sense when some history is off-screen to the left. */
export function canPan(live: XWindow, range: ChartRange): boolean {
  return range !== 'full' && live.startMs > 0
}

/**
 * The window when the user has dragged back in time. `endMs` is where they
 * want the right edge. Returns null once they've dragged back to (or past)
 * live, which means "follow live again".
 */
export function pannedWindow(live: XWindow, endMs: number): XWindow | null {
  if (endMs >= live.endMs) return null
  const span = live.endMs - live.startMs
  const end = Math.max(span, endMs)
  return { startMs: end - span, endMs: end }
}

// ---- y-axis scales --------------------------------------------------------

export interface YScale {
  min: number
  max: number
  step: number
}

// 3, 4, 6 and 8 let a fixed 4-interval scale hug the data (e.g. 0–12 mph
// instead of 0–20) while ticks stay readable.
const NICE = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]

/** Smallest "nice" number (1, 1.5, 2, 2.5, 3, 4, 5, 6 or 8 × 10ⁿ) that is ≥ `rough`. */
export function niceStep(rough: number): number {
  if (!(rough > 0)) return 1
  const exp = Math.floor(Math.log10(rough))
  const base = 10 ** exp
  for (const n of NICE) {
    // Tolerance absorbs float noise like 0.30000000000000004.
    if (n * base >= rough * (1 - 1e-9)) return clean(n * base)
  }
  return clean(10 * base)
}

/**
 * A scale with exactly `intervals` evenly spaced nice ticks that contains the
 * data. Every series uses the same `intervals`, so their gridlines line up.
 *
 * @param minSpan smallest range to show, so a steady line isn't magnified
 *   into noise (e.g. 1 mph for speed).
 * @param floor values the axis may not go below (0 for speed and HR).
 */
export function alignedScale(
  dataMin: number,
  dataMax: number,
  options: {
    intervals: number
    minSpan: number
    floor?: number
    padFraction?: number
    /** Force ticks onto multiples of this (0.5 for incline, matching the deck). */
    stepMultiple?: number
  },
): YScale {
  const { intervals, minSpan, floor = -Infinity, padFraction = 0.08, stepMultiple } = options
  const snap = (step: number) =>
    stepMultiple ? Math.max(stepMultiple, Math.ceil(step / stepMultiple - 1e-9) * stepMultiple) : step
  let lo = Math.min(dataMin, dataMax)
  let hi = Math.max(dataMin, dataMax)
  if (hi - lo < minSpan) {
    const mid = (hi + lo) / 2
    lo = mid - minSpan / 2
    hi = mid + minSpan / 2
  }
  const pad = (hi - lo) * padFraction
  lo = Math.max(floor, lo - pad)
  hi += pad

  let step = snap(niceStep((hi - lo) / intervals))
  for (let guard = 0; guard < 20; guard++) {
    let min = Math.floor(lo / step + 1e-9) * step
    if (min < floor) min = floor
    const max = min + step * intervals
    if (max >= hi - 1e-9) return { min: clean(min), max: clean(max), step }
    step = snap(niceStep(step * 1.0001))
  }
  return { min: lo, max: hi, step: (hi - lo) / intervals }
}

function clean(v: number): number {
  return Number(v.toPrecision(12))
}

/** Tick values for a scale from `alignedScale`. */
export function scaleTicks(scale: YScale): number[] {
  const n = Math.round((scale.max - scale.min) / scale.step)
  return Array.from({ length: n + 1 }, (_, i) => clean(scale.min + i * scale.step))
}

// ---- x-axis ticks ---------------------------------------------------------

const TIME_STEPS_MS = [0.5, 1, 2, 5, 10, 15, 20, 30, 60, 120].map((m) => m * MINUTE_MS)

/** Minute ticks inside the window, at most `maxTicks` of them. */
export function timeTicks(window: XWindow, maxTicks: number): number[] {
  const span = window.endMs - window.startMs
  const step = TIME_STEPS_MS.find((s) => span / s <= maxTicks) ?? TIME_STEPS_MS.at(-1)!
  const first = Math.ceil(window.startMs / step) * step
  const ticks: number[] = []
  for (let t = first; t <= window.endMs + 1; t += step) ticks.push(t)
  return ticks
}

// ---- data thinning --------------------------------------------------------

export interface ChartPoint {
  t: number
  speedMph: number
  inclinePct: number
  hr: number | null
}

/**
 * Samples inside the window (plus one either side, so lines run to the
 * edges), averaged into at most `maxPoints` time buckets. A 2-hour run is
 * 7,200 samples; the screen is ~1,000 px wide.
 */
export function visiblePoints(
  samples: readonly Sample[],
  window: XWindow,
  maxPoints: number,
): ChartPoint[] {
  if (samples.length === 0) return []
  let first = lowerBound(samples, window.startMs)
  let last = lowerBound(samples, window.endMs)
  first = Math.max(0, first - 1)
  last = Math.min(samples.length - 1, last)
  const slice = samples.slice(first, last + 1)
  const toPoint = (s: Sample): ChartPoint => ({
    t: s.t,
    speedMph: s.speedMph,
    inclinePct: s.inclinePct,
    hr: s.hr ?? null,
  })
  if (slice.length <= maxPoints) return slice.map(toPoint)

  const bucketMs = (window.endMs - window.startMs) / maxPoints
  const out: ChartPoint[] = []
  let i = 0
  // Keep the edge points exact so the line still reaches both sides.
  out.push(toPoint(slice[0]))
  i = 1
  while (i < slice.length - 1) {
    const bucket = Math.floor(slice[i].t / bucketMs)
    let n = 0
    let t = 0
    let speed = 0
    let incline = 0
    let hrSum = 0
    let hrN = 0
    while (i < slice.length - 1 && Math.floor(slice[i].t / bucketMs) === bucket) {
      const s = slice[i]
      t += s.t
      speed += s.speedMph
      incline += s.inclinePct
      if (s.hr != null) {
        hrSum += s.hr
        hrN++
      }
      n++
      i++
    }
    out.push({ t: t / n, speedMph: speed / n, inclinePct: incline / n, hr: hrN ? hrSum / hrN : null })
  }
  out.push(toPoint(slice[slice.length - 1]))
  return out
}

/** Index of the first sample with t >= `ms`. */
function lowerBound(samples: readonly Sample[], ms: number): number {
  let lo = 0
  let hi = samples.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (samples[mid].t < ms) lo = mid + 1
    else hi = mid
  }
  return lo
}
