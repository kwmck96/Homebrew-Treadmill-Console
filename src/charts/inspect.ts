/**
 * Looking back through the graph: the gesture rules and the point-in-time
 * readings. Pure functions so the rules are unit-tested; ActivityChart wires
 * them to pointer events and timers.
 *
 * Two ways a reading cursor appears:
 * - Anchored: while the view is dragged back in time, the cursor sits where
 *   the live line is normally drawn (1 min in from the right edge) and the
 *   data slides under it.
 * - Scrub: once the view can't go further back (the start of the workout, or
 *   everything already fits), a tap or a pull toward the start puts the cursor
 *   under the finger instead.
 *
 * None of this touches recording; it only decides what's drawn.
 */
import type { Sample, WorkoutRecord } from '../workout/types'
import { HEADROOM_MS, pannedWindow, type XWindow } from './viewport'

/** What the user is looking at. Both null = following live. */
export interface InspectState {
  /** Right edge of the view while dragged back; null = live. */
  panEndMs: number | null
  /** Time under the finger in scrub mode; null = no scrub cursor. */
  scrubMs: number | null
}

export const LIVE: InspectState = { panEndMs: null, scrubMs: null }

/**
 * - `pending`: started at the left limit; the cursor is under the finger and
 *   the first real movement decides between scrubbing and panning.
 * - `pan`: dragging the view.
 * - `scrub`: the cursor follows the finger.
 */
export type GestureMode = 'pending' | 'pan' | 'scrub'

export interface Gesture {
  startX: number
  /** View's right edge when the gesture began. */
  startEndMs: number
  mode: GestureMode
}

export interface GestureContext {
  live: XWindow
  /** The window currently drawn (live or panned). */
  view: XWindow
  /** Can the view be dragged at all (5/15 min with history off-screen)? */
  pannable: boolean
  elapsedMs: number
  /** Plot rectangle in the same coordinates as the pointer x (clientX). */
  plotLeftPx: number
  plotWidthPx: number
}

/** Time under screen position `x` for a given view. */
export function timeAtX(view: XWindow, ctx: GestureContext, x: number): number {
  return view.startMs + ((x - ctx.plotLeftPx) / ctx.plotWidthPx) * (view.endMs - view.startMs)
}

/** Movement (px) before a gesture at the left limit commits to a direction. */
export const DIRECTION_THRESHOLD_PX = 6
/** Letting go of a scrub this close (px) to "now" returns to live. */
const LIVE_SNAP_PX = 14

function atLeftLimit(ctx: GestureContext): boolean {
  return !ctx.pannable || ctx.view.startMs <= 0
}

/** Time under the finger, kept within the view and within recorded data. */
function scrubAt(view: XWindow, ctx: GestureContext, x: number): number {
  const lo = Math.max(0, view.startMs)
  const hi = Math.min(view.endMs, ctx.elapsedMs)
  return Math.min(hi, Math.max(lo, timeAtX(view, ctx, x)))
}

export function beginGesture(
  state: InspectState,
  ctx: GestureContext,
  x: number,
): { state: InspectState; gesture: Gesture } {
  const gesture: Gesture = { startX: x, startEndMs: ctx.view.endMs, mode: 'pan' }
  if (atLeftLimit(ctx) && ctx.elapsedMs > 0) {
    // A tap here shows the reading under the finger straight away.
    gesture.mode = 'pending'
    return { state: { ...state, scrubMs: scrubAt(ctx.view, ctx, x) }, gesture }
  }
  return { state, gesture }
}

export function moveGesture(
  state: InspectState,
  gesture: Gesture,
  ctx: GestureContext,
  x: number,
): { state: InspectState; gesture: Gesture } {
  const dx = x - gesture.startX
  let g = gesture

  if (g.mode === 'pending') {
    if (Math.abs(dx) < DIRECTION_THRESHOLD_PX) return { state, gesture: g }
    // Finger moving left pulls the view toward the present. That's a pan, but
    // only if there's somewhere to go; otherwise keep scrubbing.
    const towardPresent = dx < 0
    const canPanToPresent = ctx.pannable && state.panEndMs != null
    if (towardPresent && canPanToPresent) {
      g = { ...g, mode: 'pan' }
      state = { ...state, scrubMs: null }
    } else {
      g = { ...g, mode: 'scrub' }
    }
  }

  if (g.mode === 'scrub') {
    return { state: { ...state, scrubMs: scrubAt(ctx.view, ctx, x) }, gesture: g }
  }

  // Pan. Dragging the finger right moves the view back in time.
  const msPerPx = (ctx.view.endMs - ctx.view.startMs) / ctx.plotWidthPx
  const requestedEnd = g.startEndMs - dx * msPerPx
  const span = ctx.live.endMs - ctx.live.startMs
  if (requestedEnd < span) {
    // Hit the start of the workout and still pulling: pin the view there and
    // let the cursor follow the finger for the rest of this gesture.
    const pinned = pannedWindow(ctx.live, span) ?? ctx.view
    return {
      state: { panEndMs: pinned.endMs, scrubMs: scrubAt(pinned, ctx, x) },
      gesture: { ...g, mode: 'scrub' },
    }
  }
  const next = pannedWindow(ctx.live, requestedEnd)
  return { state: { panEndMs: next?.endMs ?? null, scrubMs: null }, gesture: g }
}

export function endGesture(state: InspectState, gesture: Gesture, ctx: GestureContext): InspectState {
  if (gesture.mode !== 'pan' && state.scrubMs != null && state.panEndMs == null) {
    // Scrubbed back to the live edge: stop inspecting.
    const msPerPx = (ctx.view.endMs - ctx.view.startMs) / ctx.plotWidthPx
    if (state.scrubMs >= ctx.elapsedMs - LIVE_SNAP_PX * msPerPx) return LIVE
  }
  return state
}

/** Time the reading cursor is at, or null when following live. */
export function cursorTime(state: InspectState, view: XWindow, pannedView: boolean): number | null {
  if (state.scrubMs != null) return state.scrubMs
  if (pannedView) return view.endMs - HEADROOM_MS
  return null
}

// ---- readings ---------------------------------------------------------------

export interface Reading {
  t: number
  speedMph: number
  inclinePct: number
  hr: number | null
  lap: number
}

/**
 * Values at time `t`, interpolated between the 1 Hz samples. HR uses the
 * nearest sample that has one (within 3 s), since it can drop out.
 */
export function readingAt(record: WorkoutRecord, t: number): Reading | null {
  const samples = record.samples
  if (samples.length === 0) return null
  const i = firstAtOrAfter(samples, t)
  const after = samples[Math.min(i, samples.length - 1)]
  const before = samples[Math.max(0, i - 1)]
  const span = after.t - before.t
  const f = span > 0 ? Math.min(1, Math.max(0, (t - before.t) / span)) : 0
  const lerp = (a: number, b: number) => a + (b - a) * f

  const nearest = Math.abs(after.t - t) < Math.abs(t - before.t) ? after : before
  const hrSample = [nearest, before, after].find((s) => s.hr != null && Math.abs(s.t - t) <= 3000)

  const lap =
    record.laps.find((l) => t >= l.startElapsedMs && t < (l.endElapsedMs ?? Infinity)) ??
    record.laps[record.laps.length - 1]

  return {
    t,
    speedMph: lerp(before.speedMph, after.speedMph),
    inclinePct: lerp(before.inclinePct, after.inclinePct),
    hr: hrSample?.hr ?? null,
    lap: lap.index,
  }
}

function firstAtOrAfter(samples: readonly Sample[], t: number): number {
  let lo = 0
  let hi = samples.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (samples[mid].t < t) lo = mid + 1
    else hi = mid
  }
  return lo
}
