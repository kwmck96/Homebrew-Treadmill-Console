import { describe, expect, it } from 'vitest'
import { mphToMetersPerSec } from '../lib/units'
import type { PlannedStep } from '../plan/expand'
import { RAMP_RATES } from '../treadmill/rampRates'
import {
  addTime,
  applyToGroup,
  canAddTime,
  canApplyToGroup,
  createRun,
  editStep,
  holdForResume,
  noteManualTargets,
  type PlanRun,
  skipStep,
  type Targets,
  tickRun,
} from './runner'

function step(p: Partial<PlannedStep> & Pick<PlannedStep, 'kind' | 'on'>): PlannedStep {
  return {
    index: 0,
    blockId: 'b',
    blockIndex: 0,
    label: p.kind,
    duration: { kind: 'time', seconds: 60 },
    speedMph: 6,
    paceSecPerMile: 600,
    targetKind: 'pace',
    hrRange: null,
    rpe: null,
    inclinePct: 0,
    restOff: false,
    advanceAtHr: null,
    group: null,
    rep: null,
    set: null,
    ...p,
  }
}

/** A belt that ramps toward commanded targets at the estimated rates. */
class Belt {
  actual: Targets = { speedMph: 1, inclinePct: 0 }
  target: Targets = { speedMph: 1, inclinePct: 0 }
  move(ms: number) {
    const s = (ms / 1000) * RAMP_RATES.speedMphPerSec
    const i = (ms / 1000) * RAMP_RATES.inclinePctPerSec
    const toward = (a: number, b: number, d: number) => (a < b ? Math.min(b, a + d) : Math.max(b, a - d))
    this.actual = {
      speedMph: toward(this.actual.speedMph, this.target.speedMph, s),
      inclinePct: toward(this.actual.inclinePct, this.target.inclinePct, i),
    }
  }
}

interface Log {
  t: number
  speed: number
  index: number
  split?: boolean
  completed?: boolean
}

/** Drive the runner for `seconds` in 100 ms ticks. */
function drive(run: PlanRun, belt: Belt, seconds: number, state = { t: 0, d: 0 }, log: Log[] = []) {
  let r = run
  for (let i = 0; i < seconds * 10; i++) {
    belt.move(100)
    const off = r.phase === 'running' && r.steps[r.index]?.restOff
    const distM = off ? 0 : mphToMetersPerSec(belt.actual.speedMph) * 0.1
    state.t += 100
    state.d += distM
    const res = tickRun(r, {
      dtMs: 100,
      realDtMs: 100,
      distM,
      actual: belt.actual,
      beltRunning: true,
      elapsedMs: state.t,
      distanceM: state.d,
    })
    if (res.command) belt.target = res.command
    r = res.run
    if (res.split || res.completed) {
      log.push({ t: state.t, speed: belt.actual.speedMph, index: r.index, split: res.split, completed: res.completed })
    }
  }
  return { run: r, state, log }
}

const warmup = step({ kind: 'warmup', on: false, speedMph: 6, duration: { kind: 'time', seconds: 20 } })
const rep = (n: number) =>
  step({ kind: 'work', on: true, speedMph: 10, duration: { kind: 'time', seconds: 10 }, group: 'g:work', rep: n })
const rec = (n: number) =>
  step({ kind: 'recovery', on: false, speedMph: 6, duration: { kind: 'time', seconds: 10 }, group: 'g:rec', rep: n })

describe('workout runner', () => {
  it('starts an off step at once and ramps into the next on step before the boundary', () => {
    const belt = new Belt()
    const { run, log } = drive(createRun('t', [warmup, rep(1), rec(1), rep(2)]), belt, 25)
    // Warmup starts on the first tick (and splits), at walking speed.
    expect(log[0]).toMatchObject({ index: 0, split: true })
    // Interval 1 starts at 20 s of warmup, already at 10 mph.
    const rep1 = log.find((l) => l.index === 1)!
    expect(rep1.speed).toBeCloseTo(10, 5)
    expect(run.results[0].endMs! - run.results[0].startMs).toBeCloseTo(20_000, -2)
  })

  it('an on first step waits for the belt to reach speed before its clock starts', () => {
    const belt = new Belt()
    const { run, log } = drive(createRun('t', [rep(1), rec(1)]), belt, 20)
    // 1 → 10 mph at 2 mph/s = 4.5 s before the rep's clock starts.
    expect(log[0].index).toBe(0)
    expect(log[0].t).toBeGreaterThanOrEqual(4500)
    expect(log[0].speed).toBeCloseTo(10, 1)
    // Then 10 s of rep.
    const recStart = log.find((l) => l.index === 1)!
    expect(recStart.t - log[0].t).toBeCloseTo(10_000, -2)
    expect(run.index).toBe(1)
  })

  it('completes, holds the belt, and auto-ends 5 s later', () => {
    const belt = new Belt()
    const short = step({ kind: 'cooldown', on: false, speedMph: 5, duration: { kind: 'time', seconds: 5 } })
    let { run } = drive(createRun('t', [short]), belt, 6)
    expect(run.phase).toBe('complete')
    expect(belt.target.speedMph).toBe(5)
    const left = run.completeLeftMs
    expect(left).toBeGreaterThan(4000)
    const r = tickRun(run, { dtMs: left - 100, realDtMs: left - 100, distM: 0, actual: belt.actual, beltRunning: true, elapsedMs: 0, distanceM: 0 })
    expect(r.autoEnd).toBe(false)
    run = r.run
    expect(tickRun(run, { dtMs: 200, realDtMs: 200, distM: 0, actual: belt.actual, beltRunning: true, elapsedMs: 0, distanceM: 0 }).autoEnd).toBe(true)
  })

  it('+15 s only on recovery/rest; extends the step; undoes a pre-ramp already under way', () => {
    const belt = new Belt()
    let { run, state } = drive(createRun('t', [warmup, rep(1), rec(1), rep(2)]), belt, 21)
    expect(canAddTime(run)).toBe(false) // in a work rep
    ;({ run, state } = drive(run, belt, 9.5, state)) // end of rep 1 → recovery
    ;({ run, state } = drive(run, belt, 8.5, state)) // 1.5 s left in recovery: pre-ramping
    expect(run.index).toBe(2)
    expect(canAddTime(run)).toBe(true)
    expect(run.preRamp).toBe(true)
    expect(belt.target.speedMph).toBe(10)
    run = addTime(run, 15_000)
    state.t += 100
    const res = tickRun(run, { dtMs: 100, realDtMs: 100, distM: 0, actual: belt.actual, beltRunning: true, elapsedMs: state.t, distanceM: state.d })
    expect(res.command?.speedMph).toBe(6) // back to recovery speed
    run = res.run
    ;({ run } = drive(run, belt, 14, state))
    expect(run.index).toBe(2) // still recovering
    ;({ run } = drive(run, belt, 2, state))
    expect(run.index).toBe(3)
    expect(run.results[2].addedMs).toBe(15_000)
    expect(run.results[2].endMs! - run.results[2].startMs).toBeCloseTo(25_000, -2)
  })

  it('distance steps end at the distance; off-treadmill rest credits none', () => {
    const belt = new Belt()
    const d = step({ kind: 'steady', on: false, speedMph: 6, duration: { kind: 'distance', meters: 100 } })
    const off = step({ kind: 'rest', on: false, speedMph: 0, restOff: true, duration: { kind: 'time', seconds: 5 } })
    const { run } = drive(createRun('t', [d, off, rep(1)]), belt, 60)
    const [r0, r1] = run.results
    expect(r0.endM! - r0.startM).toBeGreaterThanOrEqual(100)
    expect(r0.endM! - r0.startM).toBeLessThan(101)
    expect(r1.endM! - r1.startM).toBe(0)
    // The rest ran the belt at the rep's speed.
    expect(run.steps[1].speedMph).toBe(10)
  })

  it('skip ends the step now and marks it', () => {
    const belt = new Belt()
    let { run, state } = drive(createRun('t', [warmup, rep(1)]), belt, 3)
    const res = skipStep(run, { elapsedMs: state.t, distanceM: state.d })
    expect(res.split).toBe(true)
    expect(res.command?.speedMph).toBe(10)
    run = res.run
    expect(run.index).toBe(1)
    expect(run.results[0]).toMatchObject({ skipped: true, endMs: 3000 })
  })

  it('resume: countdown, then the step targets; an on step waits for speed again', () => {
    const belt = new Belt()
    let { run, state } = drive(createRun('t', [rep(1)]), belt, 8)
    const before = run.stepMs
    belt.actual = { speedMph: 1, inclinePct: 0 } // resumed at walking speed
    belt.target = { speedMph: 1, inclinePct: 0 }
    run = holdForResume(run)
    ;({ run, state } = drive(run, belt, 2.9, state))
    expect(belt.target.speedMph).toBe(1) // still counting down
    expect(run.stepMs).toBe(before)
    ;({ run, state } = drive(run, belt, 1, state))
    expect(belt.target.speedMph).toBe(10)
    expect(run.hold?.kind).toBe('reaching')
    ;({ run } = drive(run, belt, 5, state))
    expect(run.hold).toBeNull()
    expect(run.stepMs).toBeGreaterThan(before)
    expect(run.results).toHaveLength(1) // no second split on resume
  })

  it('apply to all: manual change in a rep copies to the remaining reps of its group', () => {
    const belt = new Belt()
    let { run } = drive(createRun('t', [rep(1), rec(1), rep(2), rec(2), rep(3)]), belt, 6)
    expect(run.index).toBe(0)
    expect(canApplyToGroup(run)).toBe(true)
    const m = noteManualTargets(run, { speedMph: 10.5, inclinePct: 1 })
    expect(m.index).toBe(0)
    run = { ...m.run, applyToGroup: true }
    expect(canApplyToGroup(run)).toBe(false)
    ;({ run } = drive(run, belt, 10))
    expect(run.steps[2]).toMatchObject({ speedMph: 10.5, inclinePct: 1 })
    expect(run.steps[4]).toMatchObject({ speedMph: 10.5, inclinePct: 1 })
    expect(run.steps[1].speedMph).toBe(6) // recoveries untouched
  })

  it('applyToGroup re-links off-treadmill rests', () => {
    const off = step({ kind: 'rest', on: false, speedMph: 0, restOff: true, group: 'g:rec' })
    const steps = applyToGroup([{ ...rep(1), speedMph: 11 }, off, rep(2)], 0)
    expect(steps[2].speedMph).toBe(11)
    expect(steps[1].speedMph).toBe(11)
  })

  it('live edits: completed steps locked; current step edits command the belt', () => {
    const belt = new Belt()
    let { run } = drive(createRun('t', [warmup, rep(1), rep(2)]), belt, 25)
    expect(run.index).toBe(1)
    expect(editStep(run, 0, { speedMph: 3 }).run).toBe(run) // locked
    const e = editStep(run, 1, { speedMph: 10.4, seconds: 30 })
    expect(e.command?.speedMph).toBe(10.4)
    expect(e.run.steps[1].duration).toEqual({ kind: 'time', seconds: 30 })
    const later = editStep(e.run, 2, { inclinePct: 2 })
    expect(later.command).toBeNull()
    expect(later.run.steps[2].inclinePct).toBe(2)
  })

  it('freezes while the belt is not running', () => {
    const run = createRun('t', [warmup])
    const res = tickRun(run, { dtMs: 1000, realDtMs: 1000, distM: 0, actual: { speedMph: 0, inclinePct: 0 }, beltRunning: false, elapsedMs: 0, distanceM: 0 })
    expect(res.run).toBe(run)
    expect(res.command).toBeNull()
  })
})
