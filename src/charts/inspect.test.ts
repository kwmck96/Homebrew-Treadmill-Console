import { describe, expect, it } from 'vitest'
import type { WorkoutRecord } from '../workout/types'
import {
  beginGesture,
  cursorTime,
  endGesture,
  type GestureContext,
  type InspectState,
  LIVE,
  moveGesture,
  readingAt,
} from './inspect'
import { canPan, liveWindow, MINUTE_MS, pannedWindow } from './viewport'

const min = (m: number) => m * MINUTE_MS
/** Plot is 600 px wide starting at x = 100. */
const PLOT = { plotLeftPx: 100, plotWidthPx: 600 }

function ctxFor(state: InspectState, elapsedMs: number, range: '5' | '15' | 'full'): GestureContext {
  const live = liveWindow(elapsedMs, range)
  const pannable = canPan(live, range)
  const panned = pannable && state.panEndMs != null ? pannedWindow(live, state.panEndMs) : null
  return { live, view: panned ?? live, pannable, elapsedMs, ...PLOT }
}

/** Run a full gesture: down at x0, moves through xs, up. */
function gesture(state: InspectState, elapsedMs: number, range: '5' | '15' | 'full', x0: number, xs: number[]) {
  let { state: s, gesture: g } = beginGesture(state, ctxFor(state, elapsedMs, range), x0)
  for (const x of xs) ({ state: s, gesture: g } = moveGesture(s, g, ctxFor(s, elapsedMs, range), x))
  return { state: endGesture(s, g, ctxFor(s, elapsedMs, range)), mode: g.mode }
}

describe('inspecting the graph', () => {
  // 5-min range, 30 min in: live view is 25–31 min, 6 min over 600 px = 0.6 s/px.
  const T = min(30)

  it('dragging right pans back and anchors the cursor at the live-line position', () => {
    const { state, mode } = gesture(LIVE, T, '5', 400, [500])
    expect(mode).toBe('pan')
    expect(state.panEndMs).toBe(min(30)) // 100 px × 0.6 s = 1 min back
    const view = ctxFor(state, T, '5').view
    expect(cursorTime(state, view, true)).toBe(min(29)) // 1 min in from the right edge
  })

  it('a plain tap while live does nothing', () => {
    const { state } = gesture(LIVE, T, '5', 400, [])
    expect(state).toEqual(LIVE)
  })

  it('pulling past the start pins the view and the cursor follows the finger', () => {
    // Drag far enough right to hit 0–6 min, then keep going.
    const { state, mode } = gesture(LIVE, T, '5', 100, [600, 3000, 3100])
    expect(mode).toBe('scrub')
    expect(state.panEndMs).toBe(min(6))
    // Finger at 3100 is beyond the plot, so the cursor clamps to the view's right edge.
    expect(state.scrubMs).toBe(min(6))
  })

  it('at the start, a tap shows the reading under the finger', () => {
    const atStart: InspectState = { panEndMs: min(6), scrubMs: null }
    const { state } = gesture(atStart, T, '5', 250, [])
    expect(state.scrubMs).toBe(min(1.5)) // 150 px into a 0–6 min view
    expect(state.panEndMs).toBe(min(6))
  })

  it('at the start, pulling toward the start scrubs; pulling toward the present pans', () => {
    const atStart: InspectState = { panEndMs: min(6), scrubMs: null }
    const back = gesture(atStart, T, '5', 250, [260, 300])
    expect(back.mode).toBe('scrub')
    expect(back.state.scrubMs).toBe(min(2))

    const forward = gesture(atStart, T, '5', 400, [390, 300])
    expect(forward.mode).toBe('pan')
    expect(forward.state.scrubMs).toBeNull()
    expect(forward.state.panEndMs).toBe(min(7)) // 100 px toward present
  })

  it('swiping all the way back to the right end returns to live', () => {
    const panned: InspectState = { panEndMs: min(20), scrubMs: null }
    const { state } = gesture(panned, T, '5', 600, [100, -2000])
    expect(state).toEqual(LIVE)
  })

  it('in Full (nothing to scroll) any drag scrubs, and letting go at now returns to live', () => {
    const e = min(20) // Full view 0–21 min, 2.1 s/px
    const mid = gesture(LIVE, e, 'full', 300, [290, 250])
    expect(mid.mode).toBe('scrub')
    expect(mid.state.scrubMs).toBeCloseTo(min(21) * (150 / 600), -2)

    const toNow = gesture(LIVE, e, 'full', 300, [310, 690])
    expect(toNow.state).toEqual(LIVE)
  })

  it('never puts the cursor past recorded data', () => {
    const e = min(3) // view 0–6 min, data only to 3:00
    const ctx = ctxFor(LIVE, e, '15')
    const down = beginGesture(LIVE, ctx, 250)
    expect(down.state.scrubMs).toBe(min(1.5))
    const moved = moveGesture(down.state, down.gesture, ctx, 650)
    expect(moved.state.scrubMs).toBe(min(3))
  })
})

describe('readingAt', () => {
  const record = {
    samples: [
      { t: 1000, speedMph: 6, inclinePct: 0, distanceM: 0, hr: 140 },
      { t: 2000, speedMph: 8, inclinePct: 2, distanceM: 0, hr: 150 },
      { t: 3000, speedMph: 8, inclinePct: 2, distanceM: 0 },
    ],
    laps: [
      { index: 1, trigger: 'start', startElapsedMs: 0, startDistanceM: 0, startElevGainM: 0, startElevLossM: 0, endElapsedMs: 2000 },
      { index: 2, trigger: 'manual', startElapsedMs: 2000, startDistanceM: 0, startElevGainM: 0, startElevLossM: 0 },
    ],
  } as unknown as WorkoutRecord

  it('interpolates between samples and finds the lap', () => {
    const r = readingAt(record, 1500)!
    expect(r.speedMph).toBe(7)
    expect(r.inclinePct).toBe(1)
    expect(r.lap).toBe(1)
    expect(readingAt(record, 2500)!.lap).toBe(2)
  })

  it('uses the nearest heart rate, tolerating a missing sample', () => {
    expect(readingAt(record, 1400)!.hr).toBe(140)
    expect(readingAt(record, 3000)!.hr).toBe(150)
  })
})
