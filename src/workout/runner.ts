/**
 * The workout runner: walks a structured workout step by step. Pure
 * functions; the console store calls them every tick and sends the commands
 * they return to the treadmill.
 *
 * Timing rules (agreed with Kyle, 2026-10-26):
 * - "On" steps (reps, steady state) begin and end at speed. The ramp up into
 *   an on step happens at the end of the off step before it (pre-ramp), and
 *   the ramp down happens at the start of the off step after it.
 * - Two on steps in a row: the next starts at the boundary and its ramp
 *   counts in it.
 * - The first step, and the current step after a resume, wait for the belt:
 *   an on step's clock starts once the belt reaches its speed.
 * - Pause freezes the step clock. Resume: 3-2-1 at walking speed, then the
 *   step's targets.
 * - +15 s / +30 s only on recovery and rest steps; they delay the next step.
 */
import { mphToMetersPerSec } from '../lib/units'
import { linkOffRests, type PlannedStep } from '../plan/expand'
import { RAMP_RATES } from '../treadmill/rampRates'

export const RESUME_COUNTDOWN_MS = 3000
export const COMPLETE_COUNTDOWN_MS = 5000
/** Give up waiting for the belt to reach an on step's speed after this. */
const REACH_TIMEOUT_MS = 30_000
const SPEED_TOLERANCE_MPH = 0.05
const INCLINE_TOLERANCE_PCT = 0.1

export type Hold =
  /** Belt running; wait, then send the step's targets. */
  | { kind: 'countdown'; leftMs: number }
  /** On step: wait for the belt to reach its speed before the clock starts. */
  | { kind: 'reaching'; waitedMs: number }

export interface StepResult {
  index: number
  /** Workout elapsed time and distance when the step started and ended. */
  startMs: number
  startM: number
  endMs?: number
  endM?: number
  /** Time added with +15 s / +30 s. */
  addedMs: number
  skipped?: boolean
}

export interface PlanRun {
  name: string
  disableAutoLap: boolean
  /** Live copy of the steps; edits and "apply to all" change it. */
  steps: PlannedStep[]
  results: StepResult[]
  /** Current step. Equals steps.length once complete. */
  index: number
  /**
   * running: stepping through. complete: all steps done, belt holding, End
   * auto-fires after 5 s. ended: Keep running chosen; a free run again.
   */
  phase: 'running' | 'complete' | 'ended'
  /** The current step's clock has started (and its lap split). */
  started: boolean
  stepMs: number
  stepM: number
  extraMs: number
  /** Step time at which the planned duration was met (then extraMs runs). */
  baseMetAtMs: number | null
  hold: Hold | null
  /** The next step's targets were already sent (ramping before the boundary). */
  preRamp: boolean
  /** "Apply to all intervals in this step?" was answered Yes for this rep. */
  applyToGroup: boolean
  completeLeftMs: number
}

export interface Targets {
  speedMph: number
  inclinePct: number
}

export interface TickContext {
  /** Moving time this tick (simulated ms when the simulator is sped up). */
  dtMs: number
  /** Wall-clock ms, for the countdowns. */
  realDtMs: number
  /** Distance credited this tick; the engine already excludes off-treadmill rest. */
  distM: number
  actual: Targets
  /** Workout running, belt running, connected. Otherwise the runner freezes. */
  beltRunning: boolean
  /** Workout totals after this tick, for step results. */
  elapsedMs: number
  distanceM: number
}

export interface TickResult {
  run: PlanRun
  /** Targets to send to the treadmill, if they changed. */
  command: Targets | null
  /** A step started: split a lap. */
  split: boolean
  /** The last step just finished. */
  completed: boolean
  /** The 5 s "Workout complete" countdown ran out: end the workout. */
  autoEnd: boolean
}

export function createRun(name: string, steps: PlannedStep[], disableAutoLap = false): PlanRun {
  return {
    name,
    disableAutoLap,
    steps: linkOffRests(steps),
    results: [],
    index: 0,
    phase: steps.length ? 'running' : 'complete',
    started: false,
    stepMs: 0,
    stepM: 0,
    extraMs: 0,
    baseMetAtMs: null,
    // Send the first step's targets as soon as the belt is running.
    hold: { kind: 'countdown', leftMs: 0 },
    preRamp: false,
    applyToGroup: false,
    completeLeftMs: COMPLETE_COUNTDOWN_MS,
  }
}

export function currentStep(run: PlanRun): PlannedStep | null {
  return run.phase === 'running' ? (run.steps[run.index] ?? null) : null
}

export function stepTargets(step: PlannedStep): Targets {
  return { speedMph: step.speedMph, inclinePct: step.inclinePct }
}

/** Estimated ramp time between two settings at the treadmill's ramp rates. */
export function rampMs(from: Targets, to: Targets): number {
  const speed = Math.abs(to.speedMph - from.speedMph) / RAMP_RATES.speedMphPerSec
  const incline = Math.abs(to.inclinePct - from.inclinePct) / RAMP_RATES.inclinePctPerSec
  return Math.max(speed, incline) * 1000
}

function atTargets(actual: Targets, target: Targets): boolean {
  return (
    Math.abs(actual.speedMph - target.speedMph) <= SPEED_TOLERANCE_MPH &&
    Math.abs(actual.inclinePct - target.inclinePct) <= INCLINE_TOLERANCE_PCT
  )
}

/**
 * What's left of the current step. Time steps: ms. Distance steps: metres
 * until the distance is met, then ms of any added time.
 */
export function stepRemaining(run: PlanRun): { ms: number } | { m: number; extraMs: number } {
  const step = run.steps[run.index]
  if (!step) return { ms: 0 }
  if (step.duration.kind === 'time') {
    return { ms: Math.max(0, step.duration.seconds * 1000 + run.extraMs - run.stepMs) }
  }
  if (run.baseMetAtMs == null) {
    return { m: Math.max(0, step.duration.meters - run.stepM), extraMs: run.extraMs }
  }
  return { ms: Math.max(0, run.extraMs - (run.stepMs - run.baseMetAtMs)) }
}

/** 0–1 through the current step, for progress bars. */
export function stepProgress(run: PlanRun): number {
  const step = run.steps[run.index]
  if (!step) return 1
  if (step.duration.kind === 'time') {
    const total = step.duration.seconds * 1000 + run.extraMs
    return total > 0 ? Math.min(1, run.stepMs / total) : 1
  }
  return step.duration.meters > 0 ? Math.min(1, run.stepM / step.duration.meters) : 1
}

/** Estimated ms until the step ends, at the current speed for distance steps. */
function remainingMs(run: PlanRun, speedMph: number): number {
  const left = stepRemaining(run)
  if ('ms' in left) return left.ms
  return (left.m / Math.max(mphToMetersPerSec(speedMph), 0.2)) * 1000 + left.extraMs
}

export function tickRun(run: PlanRun, ctx: TickContext): TickResult {
  const result: TickResult = { run, command: null, split: false, completed: false, autoEnd: false }
  if (run.phase === 'ended' || !ctx.beltRunning) return result

  if (run.phase === 'complete') {
    const left = run.completeLeftMs - ctx.realDtMs
    result.run = { ...run, completeLeftMs: Math.max(0, left) }
    result.autoEnd = left <= 0
    return result
  }

  let r: PlanRun = { ...run }
  const step = r.steps[r.index]

  // Waiting before the clock runs: a countdown, or an on step reaching speed.
  if (r.hold) {
    if (r.hold.kind === 'countdown') {
      const left = r.hold.leftMs - ctx.realDtMs
      if (left > 0) {
        result.run = { ...r, hold: { kind: 'countdown', leftMs: left } }
        return result
      }
      result.command = stepTargets(step)
      r.hold = step.on && !atTargets(ctx.actual, stepTargets(step)) ? { kind: 'reaching', waitedMs: 0 } : null
    } else {
      const waitedMs = r.hold.waitedMs + ctx.dtMs
      if (!atTargets(ctx.actual, stepTargets(step)) && waitedMs < REACH_TIMEOUT_MS) {
        result.run = { ...r, hold: { kind: 'reaching', waitedMs } }
        return result
      }
      r.hold = null
    }
    if (!r.hold && !r.started) {
      r = beginStep(r, r.index, ctx)
      result.split = true
    }
    result.run = r
    return result
  }

  // Step clock.
  r.stepMs += ctx.dtMs
  r.stepM += ctx.distM
  const met =
    step.duration.kind === 'time'
      ? r.stepMs >= step.duration.seconds * 1000
      : r.stepM >= step.duration.meters
  if (met && r.baseMetAtMs == null) {
    r.baseMetAtMs = step.duration.kind === 'time' ? step.duration.seconds * 1000 : r.stepMs
  }
  if (met && r.stepMs - (r.baseMetAtMs ?? 0) >= r.extraMs) {
    return finishStep(r, ctx, false)
  }

  // Pre-ramp: ramp into an on step during the end of the off step before it.
  const next = r.steps[r.index + 1]
  if (next && next.on && !step.on) {
    const remaining = remainingMs(r, ctx.actual.speedMph)
    if (!r.preRamp && remaining <= rampMs(ctx.actual, stepTargets(next))) {
      r.preRamp = true
      result.command = stepTargets(next)
    } else if (r.preRamp && remaining > rampMs(stepTargets(step), stepTargets(next)) + 1000) {
      // Time was added after the ramp started: back to this step's targets.
      r.preRamp = false
      result.command = stepTargets(step)
    }
  }
  result.run = r
  return result
}

function beginStep(run: PlanRun, index: number, ctx: { elapsedMs: number; distanceM: number }): PlanRun {
  return {
    ...run,
    index,
    started: true,
    stepMs: 0,
    stepM: 0,
    extraMs: 0,
    baseMetAtMs: null,
    applyToGroup: false,
    results: [...run.results, { index, startMs: ctx.elapsedMs, startM: ctx.distanceM, addedMs: 0 }],
  }
}

function finishStep(run: PlanRun, ctx: { elapsedMs: number; distanceM: number }, skipped: boolean): TickResult {
  let r = { ...run }
  const result: TickResult = { run: r, command: null, split: false, completed: false, autoEnd: false }
  if (!r.started) r = beginStep(r, r.index, ctx)
  const results = [...r.results]
  const last = results[results.length - 1]
  results[results.length - 1] = {
    ...last,
    endMs: ctx.elapsedMs,
    endM: ctx.distanceM,
    ...(skipped ? { skipped: true } : {}),
  }
  r.results = results
  if (r.applyToGroup) r.steps = applyToGroup(r.steps, r.index)

  const nextIndex = r.index + 1
  const wasPreRamp = r.preRamp
  r.preRamp = false
  r.hold = null
  if (nextIndex >= r.steps.length) {
    // The belt holds its last speed until End or Keep running.
    result.run = { ...r, index: r.steps.length, phase: 'complete', completeLeftMs: COMPLETE_COUNTDOWN_MS }
    result.completed = true
    return result
  }
  result.run = beginStep(r, nextIndex, ctx)
  result.split = true
  if (!wasPreRamp) result.command = stepTargets(r.steps[nextIndex])
  return result
}

/** +15 s / +30 s Recovery: only during a recovery or rest step. */
export function canAddTime(run: PlanRun | undefined | null): boolean {
  const step = run ? currentStep(run) : null
  return !!step && (step.kind === 'recovery' || step.kind === 'rest')
}

export function addTime(run: PlanRun, ms: number): PlanRun {
  if (!canAddTime(run)) return run
  const results = [...run.results]
  if (run.started && results.length) {
    const last = results[results.length - 1]
    results[results.length - 1] = { ...last, addedMs: last.addedMs + ms }
  }
  return { ...run, extraMs: run.extraMs + ms, results }
}

/** Skip This Step: end the current step now and start the next. */
export function skipStep(run: PlanRun, ctx: { elapsedMs: number; distanceM: number }): TickResult {
  if (run.phase !== 'running') {
    return { run, command: null, split: false, completed: false, autoEnd: false }
  }
  return finishStep({ ...run, hold: null }, ctx, true)
}

/** After a resume: 3-2-1 at walking speed, then the step's targets. */
export function holdForResume(run: PlanRun, countdownMs = RESUME_COUNTDOWN_MS): PlanRun {
  if (run.phase !== 'running') return run
  return { ...run, hold: { kind: 'countdown', leftMs: countdownMs }, preRamp: false }
}

/**
 * The user changed speed or incline by hand. Stored on the step it belongs
 * to, so a resume or an added +15 s goes back to it: the current step, or
 * the next one while already ramping into it or resting off the treadmill
 * (where the belt runs at the next step's settings).
 * Returns the index changed, or -1.
 */
export function noteManualTargets(run: PlanRun, targets: Targets): { run: PlanRun; index: number } {
  const step = currentStep(run)
  if (!step) return { run, index: -1 }
  let index = run.index
  if (run.preRamp || step.restOff) {
    const next = run.steps.findIndex((s, i) => i > run.index && !s.restOff)
    if (next >= 0) index = next
  }
  const steps = run.steps.map((s, i) => (i === index ? { ...s, ...targets } : s))
  return { run: { ...run, steps: linkOffRests(steps) }, index }
}

/** True when the current rep has later reps in its group to apply a change to. */
export function canApplyToGroup(run: PlanRun): boolean {
  const step = currentStep(run)
  if (!step?.group || !run.started || run.applyToGroup || run.preRamp || step.restOff) return false
  return run.steps.some((s, i) => i > run.index && s.group === step.group)
}

/** Copy step `from`'s speed and incline to every later step in its group. */
export function applyToGroup(steps: PlannedStep[], from: number): PlannedStep[] {
  const source = steps[from]
  if (!source?.group) return steps
  return linkOffRests(
    steps.map((s, i) =>
      i > from && s.group === source.group
        ? { ...s, speedMph: source.speedMph, inclinePct: source.inclinePct }
        : s,
    ),
  )
}

export interface StepEdit {
  /** New planned amount, in the step's own duration kind. */
  seconds?: number
  meters?: number
  speedMph?: number
  inclinePct?: number
}

/**
 * Live edit from the workout dialog. Completed steps are locked. Returns a
 * command when the edit changes what the belt should be doing right now.
 */
export function editStep(run: PlanRun, index: number, edit: StepEdit): { run: PlanRun; command: Targets | null } {
  if (run.phase !== 'running' || index < run.index || index >= run.steps.length) {
    return { run, command: null }
  }
  const steps = run.steps.map((s, i) => {
    if (i !== index) return s
    const next = { ...s }
    if (edit.seconds != null && s.duration.kind === 'time') {
      next.duration = { kind: 'time', seconds: Math.max(1, Math.round(edit.seconds)) }
    }
    if (edit.meters != null && s.duration.kind === 'distance') {
      next.duration = { kind: 'distance', meters: Math.max(1, edit.meters) }
    }
    if (edit.speedMph != null) next.speedMph = edit.speedMph
    if (edit.inclinePct != null) next.inclinePct = edit.inclinePct
    return next
  })
  const r = { ...run, steps: linkOffRests(steps) }
  const changesTargets = edit.speedMph != null || edit.inclinePct != null
  if (!changesTargets || r.hold?.kind === 'countdown') return { run: r, command: null }
  const cur = r.steps[r.index]
  // What the belt should be on now: the next step while pre-ramping or
  // resting off the treadmill, otherwise this one.
  const live = r.preRamp ? r.index + 1 : r.index
  if (index === live || (cur.restOff && index > r.index)) {
    return { run: r, command: stepTargets(r.steps[live]) }
  }
  return { run: r, command: null }
}

/** Keep running after the last step: back to a free run. */
export function keepRunning(run: PlanRun): PlanRun {
  return { ...run, phase: 'ended' }
}

/** Step currently being credited no distance (off-treadmill rest). */
export function isOffTreadmill(run: PlanRun | undefined | null): boolean {
  return !!run && run.phase === 'running' && !!run.steps[run.index]?.restOff
}

/**
 * The workout ended (End, or Keep running then End): close the current
 * step's result if it was still open.
 */
export function closeRun(run: PlanRun, ctx: { elapsedMs: number; distanceM: number }): PlanRun {
  const results = [...run.results]
  const last = results[results.length - 1]
  if (last && last.endMs == null) results[results.length - 1] = { ...last, endMs: ctx.elapsedMs, endM: ctx.distanceM }
  return { ...run, results, phase: 'ended', hold: null, preRamp: false }
}
