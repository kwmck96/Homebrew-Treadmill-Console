import { describe, expect, it } from 'vitest'
import { createBlock, distance, pace, rest, step, time } from './defaults'
import { estimateByBlock, estimateSteps } from './estimate'
import { expandPlan, hrTargetRange, paceToBeltMph, zoneBounds } from './expand'
import type { Block, NestedBlock, RepeatBlock, WorkoutPlan } from './types'

const HR = { maxHr: 190, restHr: 50 }
const plan = (...blocks: Block[]): WorkoutPlan => ({ schemaVersion: 1, name: 't', blocks })

describe('defaults', () => {
  it("matches Kyle's element defaults", () => {
    const strides = createBlock('strides') as RepeatBlock
    expect(strides.reps).toBe(4)
    expect(strides.work.duration).toEqual(time(15))
    expect(strides.work.paceSecPerMile).toBe(pace('5:00'))
    expect(strides.recovery.kind).toBe('rest')
    expect(strides.recovery.rest).toMatchObject({ duration: time(75), where: 'on', onSpeedMph: 2.5 })

    const intervals = createBlock('intervals') as RepeatBlock
    expect([intervals.reps, intervals.work.duration, intervals.work.paceSecPerMile]).toEqual([4, time(180), 360])
    expect(intervals.recovery.active).toMatchObject({ duration: time(90), paceSecPerMile: 480 })

    const hills = createBlock('hills') as RepeatBlock
    expect([hills.reps, hills.work.inclinePct, hills.work.paceSecPerMile]).toEqual([6, 4, pace('6:40')])
    expect(hills.recovery.active.inclinePct).toBe(0)

    const nested = createBlock('nested') as NestedBlock
    expect([nested.sets, nested.reps]).toEqual([3, 4])
    expect(nested.setRecovery.active.duration).toEqual(time(180))
  })
})

describe('expandPlan', () => {
  it('turns an interval block into reps and recoveries, without the final rest by default', () => {
    const steps = expandPlan(plan(createBlock('intervals')), HR)
    expect(steps.map((s) => s.label)).toEqual([
      'Interval 1 of 4',
      'Recovery 1 of 3',
      'Interval 2 of 4',
      'Recovery 2 of 3',
      'Interval 3 of 4',
      'Recovery 3 of 3',
      'Interval 4 of 4',
    ])
    expect(steps.filter((s) => s.on)).toHaveLength(4)
    expect(steps[0].speedMph).toBe(10)
  })

  it('includes the final recovery when asked', () => {
    const b = { ...(createBlock('intervals') as RepeatBlock), restAfterFinal: true }
    expect(expandPlan(plan(b), HR)).toHaveLength(8)
  })

  it('nests sets with set recovery between them', () => {
    const n = { ...(createBlock('nested') as NestedBlock), sets: 2, reps: 2 }
    const labels = expandPlan(plan(n), HR).map((s) => s.label)
    expect(labels).toEqual([
      'Set 1 of 2 · Rep 1 of 2',
      'Recovery 1 of 1',
      'Set 1 of 2 · Rep 2 of 2',
      'Set recovery 1 of 1',
      'Set 2 of 2 · Rep 1 of 2',
      'Recovery 1 of 1',
      'Set 2 of 2 · Rep 2 of 2',
    ])
  })

  it('groups reps per block (and per set when nested) for apply-to-all', () => {
    const n = { ...(createBlock('nested') as NestedBlock), sets: 2, reps: 2 }
    const steps = expandPlan(plan(n), HR)
    expect(steps[0].group).toBe(steps[2].group)
    expect(steps[0].group).not.toBe(steps[4].group)
  })

  it('runs the belt at the next rep speed during off-treadmill rest', () => {
    const b = createBlock('intervals') as RepeatBlock
    b.recovery = { ...b.recovery, kind: 'rest', rest: rest({ where: 'off', duration: time(60) }) }
    const steps = expandPlan(plan(b), HR)
    expect(steps[1]).toMatchObject({ kind: 'rest', restOff: true, speedMph: 10, label: 'Rest 1 of 3' })
  })

  it('rounds paces to the belt resolution', () => {
    expect(paceToBeltMph(pace('8:30'))).toBe(7.1)
    expect(paceToBeltMph(pace('6:40'))).toBe(9)
  })

  it('HR ranges: ±4 % for a target, heart-rate reserve for zones', () => {
    expect(hrTargetRange(150)).toEqual({ low: 144, high: 156 })
    expect(zoneBounds(2, HR)).toEqual({ low: 134, high: 148 }) // 50 + 140×0.6 / 0.7
    expect(zoneBounds(5, HR)).toEqual({ low: 176, high: 190 })
  })

  it('only HR-target recoveries auto-advance', () => {
    const b = createBlock('activeRecovery')
    if (b.type !== 'activeRecovery') throw new Error()
    b.step = { ...b.step, targetKind: 'hr', advanceOnHr: true, hrBpm: 120 }
    expect(expandPlan(plan(b), HR)[0].advanceAtHr).toBe(120)
    const s = createBlock('steady')
    if (s.type !== 'steady') throw new Error()
    s.step = { ...s.step, targetKind: 'hr', advanceOnHr: true }
    expect(expandPlan(plan(s), HR)[0].advanceAtHr).toBeNull()
  })
})

describe('estimates', () => {
  it('sums a typical session', () => {
    const steps = expandPlan(plan(createBlock('warmup'), createBlock('intervals'), createBlock('cooldown')), HR)
    const e = estimateSteps(steps)
    // 10:00 + 4×3:00 + 3×1:30 + 10:00
    expect(e.timeSec).toBe(600 + 720 + 270 + 600)
    expect(e.unknownTime).toBe(0)
    // 3:00 at 10 mph = 0.5 mi each
    const intervals = estimateByBlock(steps).get(steps[1].blockId)!
    expect(intervals.distanceM).toBeCloseTo(4 * 804.672 + 3 * 1609.344 * (90 / 3600) * 7.5, 0)
    expect(e.hasIncline).toBe(false)
  })

  it('computes time from distance-based steps', () => {
    const b = createBlock('steady')
    if (b.type !== 'steady') throw new Error()
    b.step = step({ duration: distance(1609.344), paceSecPerMile: pace('6:00') })
    expect(estimateSteps(expandPlan(plan(b), HR)).timeSec).toBeCloseTo(360, 6)
  })

  it('leaves HR, zone and effort steps unestimated where speed matters', () => {
    const b = createBlock('steady')
    if (b.type !== 'steady') throw new Error()
    b.step = { ...b.step, targetKind: 'rpe', duration: distance(4828) }
    const e = estimateSteps(expandPlan(plan(b), HR))
    expect(e.unknownTime).toBe(1)
    expect(e.distanceM).toBe(4828)
  })

  it('counts off-treadmill rest as time without distance', () => {
    const b = createBlock('rest')
    if (b.type !== 'rest') throw new Error()
    b.rest = rest({ where: 'off', duration: time(90) })
    const e = estimateSteps(expandPlan(plan(b), HR))
    expect([e.timeSec, e.distanceM, e.unknownDistance]).toEqual([90, 0, 0])
  })

  it('reports elevation gain, loss and net for inclined steps', () => {
    const hills = createBlock('hills')
    const e = estimateSteps(expandPlan(plan(hills), HR))
    expect(e.hasIncline).toBe(true)
    // 6 × 1:00 at 9 mph = 6 × 241.4 m at 4 % → ≈ 57.9 m
    expect(e.elevGainM).toBeCloseTo(6 * 241.4016 * (0.04 / Math.sqrt(1.0016)), 1)
    expect(e.elevLossM).toBe(0)
  })
})
