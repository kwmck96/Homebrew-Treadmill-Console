/**
 * Canvas renderer for the activity graph. Everything it needs comes in as
 * plain data; it draws one frame and returns the plot rectangle so pointer
 * handling can map pixels back to time.
 */
import {
  alignedScale,
  type ChartPoint,
  scaleTicks,
  timeTicks,
  visiblePoints,
  type XWindow,
  type YScale,
} from '../../charts/viewport'
import {
  averageMph,
  type DistanceUnit,
  formatDistance,
  formatDuration,
  formatPace,
  KM_PER_MILE,
} from '../../lib/units'
import { lapAverageHr, lapTotals } from '../../workout/engine'
import type { WorkoutRecord } from '../../workout/types'

export interface ChartColors {
  speed: string
  grade: string
  heart: string
  text: string
  mist: string
  grid: string
  bandA: string
  bandB: string
  lapLine: string
  night: string
}

export interface ChartInput {
  record: WorkoutRecord | null
  window: XWindow
  unit: DistanceUnit
  /** Draw the "now" dots (live and running). */
  showNow: boolean
  colors: ChartColors
  /** Root font size in CSS px; everything is sized from it. */
  fontPx: number
  fontFamily: string
}

export interface PlotRect {
  left: number
  top: number
  width: number
  height: number
}

/** Gridlines are shared by all three axes: same tick count on each. */
const Y_INTERVALS = 4

export function drawChart(
  ctx: CanvasRenderingContext2D,
  widthPx: number,
  heightPx: number,
  input: ChartInput,
): PlotRect {
  const { record, window: win, unit, colors, fontPx, fontFamily } = input
  const axisFont = `500 ${Math.round(fontPx * 0.78)}px ${fontFamily}`
  const unitFont = `600 ${Math.round(fontPx * 0.72)}px ${fontFamily}`
  const lapFont = `500 ${Math.round(fontPx * 0.72)}px ${fontFamily}`
  const lapFontBold = `700 ${Math.round(fontPx * 0.76)}px ${fontFamily}`
  const lapLineH = Math.round(fontPx * 0.95)

  ctx.clearRect(0, 0, widthPx, heightPx)
  setStretch(ctx)

  // ---- data and scales -------------------------------------------------
  const points: ChartPoint[] = record
    ? visiblePoints(record.samples, win, Math.max(200, Math.floor(widthPx)))
    : []
  const toDisplaySpeed = (mph: number) => (unit === 'mi' ? mph : mph * KM_PER_MILE)
  const hrPoints = points.filter((p) => p.hr != null)
  const hasHr = hrPoints.length > 0

  const speedScale = scaleFor(
    points.map((p) => toDisplaySpeed(p.speedMph)),
    { minSpan: unit === 'mi' ? 1 : 1.5, floor: 0, fallback: [0, toDisplaySpeed(8)] },
  )
  const inclineScale = scaleFor(
    points.map((p) => p.inclinePct),
    { minSpan: 2, floor: -3, fallback: [0, 2], stepMultiple: 0.5 },
  )
  const hrScale = scaleFor(
    hrPoints.map((p) => p.hr!),
    { minSpan: 20, floor: 0, fallback: [60, 180] },
  )

  // The line is belt speed, so its axis is labelled in speed even when the
  // big readouts show pace: evenly spaced speeds aren't evenly spaced paces,
  // and pace labels came out as odd values like 7:54 and 8:49.
  const speedLabel = trimNumber

  // ---- layout ------------------------------------------------------------
  ctx.font = axisFont
  const speedTickLabels = scaleTicks(speedScale).map(speedLabel)
  const inclineTickLabels = scaleTicks(inclineScale).map(trimNumber)
  const hrTickLabels = scaleTicks(hrScale).map((v) => String(Math.round(v)))
  const gap = Math.round(fontPx * 0.5)
  const leftAxisW = maxWidth(ctx, [...speedTickLabels, 'km/h']) + gap
  const inclineAxisW = maxWidth(ctx, [...inclineTickLabels, '-0.0']) + gap
  const hrAxisW = hasHr ? maxWidth(ctx, [...hrTickLabels, '000']) + gap : 0

  const unitRowH = Math.round(fontPx * 1.2)
  const xAxisH = Math.round(fontPx * 1.4)
  const lapStripH = lapLineH * 4 + Math.round(fontPx * 0.6)

  const plot: PlotRect = {
    left: leftAxisW + gap,
    top: unitRowH,
    width: Math.max(10, widthPx - leftAxisW - gap - inclineAxisW - hrAxisW - gap),
    height: 0,
  }
  // The bands run the full height; lines stay above the lap-stat strip.
  const bandBottom = heightPx - xAxisH
  plot.height = Math.max(10, bandBottom - plot.top)
  const dataBottom = bandBottom - lapStripH
  // Room inside the top of each band for its "Lap N" name.
  const dataTop = plot.top + Math.round(lapLineH * 1.6)
  const dataH = Math.max(10, dataBottom - dataTop)

  const span = win.endMs - win.startMs
  const xOf = (t: number) => plot.left + ((t - win.startMs) / span) * plot.width
  const yOf = (v: number, s: YScale) => dataBottom - ((v - s.min) / (s.max - s.min)) * dataH
  const plotRight = plot.left + plot.width

  // ---- lap bands ---------------------------------------------------------
  if (record) {
    record.laps.forEach((lap, i) => {
      const start = lap.startElapsedMs
      const end = lap.endElapsedMs ?? record.elapsedMs
      if (end <= win.startMs || start >= win.endMs) return
      const x0 = Math.max(plot.left, xOf(start))
      const x1 = Math.min(plotRight, xOf(Math.max(end, start)))
      ctx.fillStyle = i % 2 === 0 ? colors.bandA : colors.bandB
      ctx.fillRect(x0, plot.top, x1 - x0, plot.height)
      if (start > win.startMs && i > 0) {
        ctx.fillStyle = colors.lapLine
        ctx.fillRect(Math.round(xOf(start)) - 0.5, plot.top, 1, plot.height)
      }
    })
  }

  // ---- grid ----------------------------------------------------------------
  ctx.fillStyle = colors.grid
  for (let i = 0; i <= Y_INTERVALS; i++) {
    const y = Math.round(dataBottom - (i / Y_INTERVALS) * dataH) - 0.5
    ctx.fillRect(plot.left, y, plot.width, 1)
  }
  const xTicks = timeTicks(win, Math.max(3, Math.floor(plot.width / (fontPx * 5))))
  for (const t of xTicks) {
    ctx.fillRect(Math.round(xOf(t)) - 0.5, plot.top, 1, plot.height)
  }

  // ---- axes labels -------------------------------------------------------
  ctx.font = axisFont
  ctx.textBaseline = 'middle'
  const tickY = (i: number) => dataBottom - (i / Y_INTERVALS) * dataH
  // Speed: left, right-aligned against the plot.
  ctx.fillStyle = colors.speed
  ctx.textAlign = 'right'
  speedTickLabels.forEach((label, i) => ctx.fillText(label, plot.left - gap, tickY(i)))
  // Incline: first column on the right.
  ctx.fillStyle = colors.grade
  ctx.textAlign = 'left'
  inclineTickLabels.forEach((label, i) => ctx.fillText(label, plotRight + gap, tickY(i)))
  // HR: outer column on the right.
  if (hasHr) {
    ctx.fillStyle = colors.heart
    hrTickLabels.forEach((label, i) => ctx.fillText(label, plotRight + gap + inclineAxisW, tickY(i)))
  }
  // Unit captions above each axis.
  ctx.font = unitFont
  ctx.textBaseline = 'alphabetic'
  const captionY = unitRowH - Math.round(fontPx * 0.35)
  ctx.fillStyle = colors.speed
  ctx.textAlign = 'right'
  ctx.fillText(unit === 'mi' ? 'mph' : 'km/h', plot.left - gap, captionY)
  ctx.textAlign = 'left'
  ctx.fillStyle = colors.grade
  ctx.fillText('%', plotRight + gap, captionY)
  if (hasHr) {
    ctx.fillStyle = colors.heart
    ctx.fillText('bpm', plotRight + gap + inclineAxisW, captionY)
  }

  // Time axis.
  ctx.font = axisFont
  ctx.fillStyle = colors.mist
  ctx.textBaseline = 'top'
  xTicks.forEach((t, i) => {
    const x = xOf(t)
    ctx.textAlign = i === 0 && x - plot.left < fontPx ? 'left' : 'center'
    ctx.fillText(formatDuration(t), x, bandBottom + Math.round(fontPx * 0.3))
  })

  // ---- series --------------------------------------------------------------
  ctx.save()
  ctx.beginPath()
  ctx.rect(plot.left, dataTop - 4, plot.width, dataBottom - dataTop + 8)
  ctx.clip()
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'

  // HR breaks where the strap had no reading rather than bridging the gap.
  if (hasHr) strokeSeries(ctx, points, (p) => p.hr, hrScale, colors.heart, fontPx * 0.13)
  strokeSeries(ctx, points, (p) => p.inclinePct, inclineScale, colors.grade, fontPx * 0.13)
  strokeSeries(ctx, points, (p) => toDisplaySpeed(p.speedMph), speedScale, colors.speed, fontPx * 0.17)
  ctx.restore()

  function strokeSeries(
    c: CanvasRenderingContext2D,
    pts: ChartPoint[],
    value: (p: ChartPoint) => number | null,
    scale: YScale,
    color: string,
    lineWidth: number,
  ) {
    if (pts.length < 2) return
    c.beginPath()
    let penDown = false
    for (const p of pts) {
      const v = value(p)
      if (v == null) {
        penDown = false
        continue
      }
      const x = xOf(p.t)
      const y = yOf(v, scale)
      if (penDown) c.lineTo(x, y)
      else c.moveTo(x, y)
      penDown = true
    }
    c.strokeStyle = color
    c.lineWidth = lineWidth
    c.stroke()
  }

  // "Now" markers at the newest sample.
  const last = points.at(-1)
  if (input.showNow && last && last.t >= win.startMs && last.t <= win.endMs) {
    const x = xOf(last.t)
    const dots: [number, string][] = [
      [yOf(toDisplaySpeed(last.speedMph), speedScale), colors.speed],
      [yOf(last.inclinePct, inclineScale), colors.grade],
    ]
    if (last.hr != null) dots.push([yOf(last.hr, hrScale), colors.heart])
    for (const [y, color] of dots) {
      ctx.beginPath()
      ctx.arc(x, y, fontPx * 0.3, 0, Math.PI * 2)
      ctx.fillStyle = color
      ctx.fill()
      ctx.lineWidth = fontPx * 0.12
      ctx.strokeStyle = colors.night
      ctx.stroke()
    }
  }

  // ---- lap stats ------------------------------------------------------------
  if (record) {
    ctx.textAlign = 'center'
    ctx.textBaseline = 'alphabetic'
    record.laps.forEach((lap) => {
      const start = lap.startElapsedMs
      const end = lap.endElapsedMs ?? record.elapsedMs
      if (end <= win.startMs || start >= win.endMs) return
      const x0 = Math.max(plot.left, xOf(start))
      const x1 = Math.min(plotRight, xOf(end))
      const totals = lapTotals(record, lap)
      const hr = lapAverageHr(record, lap)
      const lines = [
        formatDuration(totals.elapsedMs),
        `${formatPace(averageMph(totals.distanceM, totals.elapsedMs), unit)} ${unit === 'mi' ? '/mi' : '/km'}`,
        `${formatDistance(totals.distanceM, unit)} ${unit === 'mi' ? 'mi' : 'km'}`,
        hr == null ? '-- bpm' : `${Math.round(hr)} bpm`,
      ]
      ctx.font = lapFont
      const needed = maxWidth(ctx, lines) + fontPx * 0.8
      if (x1 - x0 < needed) return
      const cx = (x0 + x1) / 2
      // Lap number tucked into the top of the band.
      ctx.font = lapFontBold
      ctx.fillStyle = colors.mist
      ctx.fillText(`Lap ${lap.index}`, cx, plot.top + Math.round(lapLineH * 1.1))
      // Stats stacked at the bottom of the band.
      lines.forEach((text, i) => {
        ctx.font = i === 0 ? lapFontBold : lapFont
        ctx.fillStyle = i === 0 ? colors.text : colors.mist
        ctx.fillText(text, cx, bandBottom - Math.round(fontPx * 0.35) - (lines.length - 1 - i) * lapLineH)
      })
    })
  }

  return plot
}

// ---- helpers ----------------------------------------------------------------

function scaleFor(
  values: number[],
  opts: { minSpan: number; floor: number; fallback: [number, number]; stepMultiple?: number },
): YScale {
  let lo = Infinity
  let hi = -Infinity
  for (const v of values) {
    if (v < lo) lo = v
    if (v > hi) hi = v
  }
  if (!Number.isFinite(lo)) [lo, hi] = opts.fallback
  return alignedScale(lo, hi, {
    intervals: Y_INTERVALS,
    minSpan: opts.minSpan,
    floor: opts.floor,
    stepMultiple: opts.stepMultiple,
  })
}

function maxWidth(ctx: CanvasRenderingContext2D, labels: string[]): number {
  return Math.ceil(Math.max(0, ...labels.map((l) => ctx.measureText(l).width)))
}

function trimNumber(v: number): string {
  return Number.isInteger(v) ? String(v) : v.toFixed(1)
}

/** Use the narrower width of the variable font for numbers, where supported. */
function setStretch(ctx: CanvasRenderingContext2D) {
  if ('fontStretch' in ctx) {
    ;(ctx as CanvasRenderingContext2D & { fontStretch: string }).fontStretch = 'semi-condensed'
  }
}
