import { describe, expect, it } from 'vitest'
import type { Sample } from '../workout/types'
import {
  alignedScale,
  canPan,
  liveWindow,
  MINUTE_MS,
  niceStep,
  pannedWindow,
  scaleTicks,
  timeTicks,
  visiblePoints,
} from './viewport'

const min = (m: number) => m * MINUTE_MS
const win = (w: { startMs: number; endMs: number }) => [w.startMs / MINUTE_MS, w.endMs / MINUTE_MS]

describe('liveWindow', () => {
  it('starts every range at 0–6 min', () => {
    for (const r of ['5', '15', 'full'] as const) {
      expect(win(liveWindow(0, r))).toEqual([0, 6])
      expect(win(liveWindow(min(5), r))).toEqual([0, 6])
    }
  })

  it('5 min: slides a 6-min window after the 5-min mark', () => {
    expect(win(liveWindow(min(7), '5'))).toEqual([2, 8])
    expect(win(liveWindow(min(60), '5'))).toEqual([55, 61])
  })

  it('15 min: zooms out from 5 min until 15 min of history, then slides', () => {
    expect(win(liveWindow(min(8), '15'))).toEqual([0, 9])
    expect(win(liveWindow(min(15), '15'))).toEqual([0, 16])
    expect(win(liveWindow(min(20), '15'))).toEqual([5, 21])
  })

  it('full: zooms out indefinitely from 0', () => {
    expect(win(liveWindow(min(8), 'full'))).toEqual([0, 9])
    expect(win(liveWindow(min(120), 'full'))).toEqual([0, 121])
  })
})

describe('panning', () => {
  it('is only possible when history is off-screen and not in full view', () => {
    expect(canPan(liveWindow(min(3), '5'), '5')).toBe(false)
    expect(canPan(liveWindow(min(10), '5'), '5')).toBe(true)
    expect(canPan(liveWindow(min(10), '15'), '15')).toBe(false)
    expect(canPan(liveWindow(min(30), 'full'), 'full')).toBe(false)
  })

  it('keeps the window width and stops at the start of the workout', () => {
    const live = liveWindow(min(30), '5') // 25–31
    expect(win(pannedWindow(live, min(20))!)).toEqual([14, 20])
    expect(win(pannedWindow(live, min(2))!)).toEqual([0, 6])
  })

  it('returns to live when dragged back to the end', () => {
    const live = liveWindow(min(30), '5')
    expect(pannedWindow(live, min(31))).toBeNull()
    expect(pannedWindow(live, min(40))).toBeNull()
  })
})

describe('scales', () => {
  it('picks nice steps', () => {
    expect(niceStep(0.3)).toBe(0.3)
    expect(niceStep(0.35)).toBe(0.4)
    expect(niceStep(2.2)).toBe(2.5)
    expect(niceStep(7)).toBe(8)
    expect(niceStep(18)).toBe(20)
    expect(niceStep(9)).toBe(10)
  })

  it('contains the data with exactly N aligned intervals', () => {
    const cases: [number, number, number, number][] = [
      [6.9, 11.1, 1, 0], // speed
      [0, 2, 2, -3], // incline
      [128, 181, 20, 0], // HR
      [3, 3, 1, 0], // flat line
    ]
    for (const [lo, hi, minSpan, floor] of cases) {
      const s = alignedScale(lo, hi, { intervals: 4, minSpan, floor })
      expect(s.min).toBeLessThanOrEqual(lo)
      expect(s.max).toBeGreaterThanOrEqual(hi)
      expect(scaleTicks(s)).toHaveLength(5)
      expect(s.min).toBeGreaterThanOrEqual(floor)
    }
  })

  it('hugs a typical interval session instead of doubling the range', () => {
    // 1 mph start ramp up to 11 mph repeats
    const s = alignedScale(1, 11, { intervals: 4, minSpan: 1, floor: 0 })
    expect(s.max).toBeLessThanOrEqual(12)
  })

  it('keeps incline ticks on 0.5 % steps', () => {
    for (const [lo, hi] of [
      [1, 3],
      [1, 1],
      [-3, 15],
      [0, 2.5],
    ]) {
      const s = alignedScale(lo, hi, { intervals: 4, minSpan: 2, floor: -3, stepMultiple: 0.5 })
      for (const t of scaleTicks(s)) expect((t * 2) % 1).toBeCloseTo(0, 9)
    }
  })

  it("doesn't magnify a steady line", () => {
    const s = alignedScale(7.0, 7.0, { intervals: 4, minSpan: 1, floor: 0 })
    expect(s.max - s.min).toBeGreaterThanOrEqual(1)
  })

  it('places minute ticks inside the window', () => {
    expect(timeTicks({ startMs: 0, endMs: min(6) }, 8).map((t) => t / MINUTE_MS)).toEqual([
      0, 1, 2, 3, 4, 5, 6,
    ])
    const long = timeTicks({ startMs: 0, endMs: min(121) }, 8)
    expect(long.length).toBeLessThanOrEqual(9)
    expect(long[1] - long[0]).toBe(min(20))
  })
})

describe('visiblePoints', () => {
  const samples: Sample[] = Array.from({ length: 3600 }, (_, i) => ({
    t: (i + 1) * 1000,
    speedMph: 6,
    inclinePct: 1,
    distanceM: 0,
    hr: i % 2 ? 150 : 160,
  }))

  it('returns the window plus one sample either side', () => {
    const pts = visiblePoints(samples, { startMs: 10_500, endMs: 20_500 }, 1000)
    expect(pts[0].t).toBe(10_000)
    expect(pts.at(-1)!.t).toBe(21_000)
  })

  it('averages long ranges down to the point budget, keeping the edges', () => {
    const pts = visiblePoints(samples, { startMs: 0, endMs: min(61) }, 500)
    expect(pts.length).toBeLessThanOrEqual(502)
    expect(pts[0].t).toBe(1000)
    expect(pts.at(-1)!.t).toBe(3_600_000)
    expect(pts[10].hr).toBeGreaterThan(150)
    expect(pts[10].hr).toBeLessThan(160)
  })

  it('handles an empty workout', () => {
    expect(visiblePoints([], { startMs: 0, endMs: min(6) }, 100)).toEqual([])
  })
})
