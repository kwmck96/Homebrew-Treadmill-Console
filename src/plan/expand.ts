/**
 * Blocks → a flat list of steps, the form estimates and the runner work with.
 */
import { quantize, TRM885_LIMITS } from '../treadmill/limits'
import { BLOCK_LABELS } from './defaults'
import type { Block, Duration, HrProfile, Recovery, RestSpec, StepSpec, TargetKind, WorkoutPlan, ZoneSpec } from './types'

export type StepKind = 'warmup' | 'steady' | 'work' | 'recovery' | 'rest' | 'cooldown'

export interface PlannedStep {
  /** Position in the flat list. */
  index: number
  blockId: string
  blockIndex: number
  kind: StepKind
  /**
   * "On" steps (reps, steady state) start and end at speed; the ramps happen
   * in the neighbouring off steps (warmup, cooldown, recovery, rest).
   */
  on: boolean
  label: string
  duration: Duration
  /** Belt speed to command (0.1 mph resolution), or null if not running. */
  speedMph: number
  /** Pace as entered, for display (null for rest). */
  paceSecPerMile: number | null
  targetKind: TargetKind | 'none'
  /** Accepted HR range for HR and zone targets. */
  hrRange: { low: number; high: number } | null
  rpe: number | null
  inclinePct: number
  /** Off-treadmill rest: time runs, distance doesn't. */
  restOff: boolean
  /** Advance to the next step 5 s after HR falls to this, if set. */
  advanceAtHr: number | null
  /**
   * Reps that belong together for "Apply to all intervals in this step?":
   * same block, same set, same role.
   */
  group: string | null
  /** 1-based rep and set numbers within the block, where they apply. */
  rep: number | null
  set: number | null
}

/** Pace → belt speed at the treadmill's 0.1 mph resolution. */
export function paceToBeltMph(secPerMile: number): number {
  const mph = 3600 / secPerMile
  return quantize(
    Math.min(TRM885_LIMITS.maxSpeedMph, Math.max(TRM885_LIMITS.minSpeedMph, mph)),
    TRM885_LIMITS.speedStepMph,
  )
}

/** ±4 % around an HR target. */
export function hrTargetRange(bpm: number): { low: number; high: number } {
  return { low: Math.round(bpm * 0.96), high: Math.round(bpm * 1.04) }
}

/** 5-zone heart-rate-reserve (Karvonen) model. */
export function zoneBounds(zone: 1 | 2 | 3 | 4 | 5, hr: HrProfile): { low: number; high: number } {
  const reserve = hr.maxHr - hr.restHr
  const lowPct = 0.5 + 0.1 * (zone - 1)
  return {
    low: Math.round(hr.restHr + reserve * lowPct),
    high: Math.round(hr.restHr + reserve * (lowPct + 0.1)),
  }
}

export function zoneRange(zone: ZoneSpec, hr: HrProfile): { low: number; high: number } {
  return zone.mode === 'computed' ? zoneBounds(zone.zone, hr) : { low: zone.lowBpm, high: zone.highBpm }
}

type Draft = Omit<PlannedStep, 'index'>

function fromStep(
  s: StepSpec,
  base: Pick<Draft, 'blockId' | 'blockIndex' | 'kind' | 'on' | 'label' | 'group' | 'rep' | 'set'>,
  hr: HrProfile,
): Draft {
  const recoveryish = !base.on
  return {
    ...base,
    duration: s.duration,
    speedMph: paceToBeltMph(s.paceSecPerMile),
    paceSecPerMile: s.paceSecPerMile,
    targetKind: s.targetKind,
    hrRange:
      s.targetKind === 'hr' ? hrTargetRange(s.hrBpm) : s.targetKind === 'zone' ? zoneRange(s.zone, hr) : null,
    rpe: s.targetKind === 'rpe' ? s.rpe : null,
    inclinePct: s.inclinePct,
    restOff: false,
    advanceAtHr: recoveryish && s.targetKind === 'hr' && s.advanceOnHr ? s.hrBpm : null,
  }
}

function fromRest(
  r: RestSpec,
  base: Pick<Draft, 'blockId' | 'blockIndex' | 'label' | 'group' | 'rep' | 'set'>,
): Draft {
  const off = r.where === 'off'
  return {
    ...base,
    kind: 'rest',
    on: false,
    // Off-treadmill rest is time-only.
    duration: off && r.duration.kind === 'distance' ? { kind: 'time', seconds: 120 } : r.duration,
    // Off-treadmill: patched to the next step's speed and incline below.
    speedMph: off ? 0 : quantize(r.onSpeedMph, 0.1),
    paceSecPerMile: null,
    targetKind: r.useHr ? 'hr' : 'none',
    hrRange: r.useHr ? hrTargetRange(r.hrBpm) : null,
    rpe: null,
    inclinePct: 0,
    restOff: off,
    advanceAtHr: r.useHr && r.advanceOnHr ? r.hrBpm : null,
  }
}

function fromRecovery(
  rec: Recovery,
  base: Pick<Draft, 'blockId' | 'blockIndex' | 'group' | 'rep' | 'set'> & { label: string },
  hr: HrProfile,
): Draft {
  return rec.kind === 'rest'
    ? fromRest(rec.rest, { ...base, label: base.label.replace('Recovery', 'Rest') })
    : fromStep(rec.active, { ...base, kind: 'recovery', on: false }, hr)
}

const REP_NOUN: Record<string, string> = {
  strides: 'Stride',
  intervals: 'Interval',
  hills: 'Hill',
  nested: 'Rep',
}

function expandBlock(b: Block, blockIndex: number, hr: HrProfile): Draft[] {
  const base = { blockId: b.id, blockIndex, group: null, rep: null, set: null }
  switch (b.type) {
    case 'warmup':
    case 'cooldown':
    case 'activeRecovery':
      return [
        fromStep(
          b.step,
          {
            ...base,
            kind: b.type === 'activeRecovery' ? 'recovery' : b.type,
            on: false,
            label: BLOCK_LABELS[b.type],
          },
          hr,
        ),
      ]
    case 'steady':
      return [fromStep(b.step, { ...base, kind: 'steady', on: true, label: BLOCK_LABELS.steady }, hr)]
    case 'rest':
      return [fromRest(b.rest, { ...base, label: BLOCK_LABELS.rest })]
    case 'strides':
    case 'intervals':
    case 'hills': {
      const out: Draft[] = []
      for (let r = 1; r <= b.reps; r++) {
        out.push(
          fromStep(
            b.work,
            { ...base, kind: 'work', on: true, label: `${REP_NOUN[b.type]} ${r} of ${b.reps}`, group: `${b.id}:work`, rep: r },
            hr,
          ),
        )
        if (r < b.reps || b.restAfterFinal) {
          out.push(
            fromRecovery(
              b.recovery,
              { ...base, label: `Recovery ${r} of ${b.restAfterFinal ? b.reps : b.reps - 1}`, group: `${b.id}:rec`, rep: r },
              hr,
            ),
          )
        }
      }
      return out
    }
    case 'nested': {
      const out: Draft[] = []
      for (let s = 1; s <= b.sets; s++) {
        for (let r = 1; r <= b.reps; r++) {
          out.push(
            fromStep(
              b.work,
              {
                ...base,
                kind: 'work',
                on: true,
                label: `Set ${s} of ${b.sets} · Rep ${r} of ${b.reps}`,
                group: `${b.id}:s${s}:work`,
                rep: r,
                set: s,
              },
              hr,
            ),
          )
          const lastRep = r === b.reps
          const lastSet = s === b.sets
          if (!lastRep) {
            out.push(
              fromRecovery(
                b.recovery,
                { ...base, label: `Recovery ${r} of ${b.reps - 1}`, group: `${b.id}:s${s}:rec`, rep: r, set: s },
                hr,
              ),
            )
          } else if (!lastSet) {
            out.push(
              fromRecovery(
                b.setRecovery,
                { ...base, label: `Set recovery ${s} of ${b.sets - 1}`, group: `${b.id}:setrec`, rep: null, set: s },
                hr,
              ),
            )
          } else if (b.restAfterFinal) {
            out.push(
              fromRecovery(
                b.recovery,
                { ...base, label: 'Recovery', group: `${b.id}:s${s}:rec`, rep: r, set: s },
                hr,
              ),
            )
          }
        }
      }
      return out
    }
  }
}

export function expandPlan(plan: WorkoutPlan, hr: HrProfile): PlannedStep[] {
  const drafts = plan.blocks.flatMap((b, i) => expandBlock(b, i, hr))
  return linkOffRests(drafts.map((d, index) => ({ ...d, index })))
}

/**
 * Off-treadmill rest runs the belt at the next step's speed and incline so
 * the next rep starts at speed. With nothing after it, hold the previous.
 * Returns a new array; call again after editing steps during a run.
 */
export function linkOffRests(steps: PlannedStep[]): PlannedStep[] {
  const out = steps.map((s) => ({ ...s }))
  for (let i = 0; i < out.length; i++) {
    const d = out[i]
    if (!d.restOff) continue
    const next = out.slice(i + 1).find((x) => !x.restOff)
    const prev = out.slice(0, i).reverse().find((x) => !x.restOff)
    const source = next ?? prev
    d.speedMph = source?.speedMph ?? 2.5
    d.inclinePct = source?.inclinePct ?? 0
  }
  return out
}
