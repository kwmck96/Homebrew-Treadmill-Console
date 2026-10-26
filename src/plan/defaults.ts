/**
 * Default contents for each builder element (Kyle, 2026-10-26).
 */
import type {
  Block,
  BlockType,
  Duration,
  Recovery,
  RestSpec,
  StepSpec,
  WorkoutPlan,
} from './types'

export const BLOCK_LABELS: Record<BlockType, string> = {
  warmup: 'Warmup',
  strides: 'Strides',
  steady: 'Steady state',
  intervals: 'Intervals',
  nested: 'Nested intervals',
  hills: 'Hills',
  rest: 'Rest',
  activeRecovery: 'Active recovery',
  cooldown: 'Cooldown',
}

/** Palette order in the builder. */
export const BLOCK_ORDER: BlockType[] = [
  'warmup',
  'strides',
  'steady',
  'intervals',
  'nested',
  'hills',
  'rest',
  'activeRecovery',
  'cooldown',
]

/** "6:00" → 360 */
export function pace(mmss: string): number {
  const [m, s] = mmss.split(':').map(Number)
  return m * 60 + s
}

export const time = (seconds: number): Duration => ({ kind: 'time', seconds })
export const distance = (meters: number): Duration => ({ kind: 'distance', meters })

export function step(overrides: Partial<StepSpec> = {}): StepSpec {
  return {
    duration: time(300),
    targetKind: 'pace',
    paceSecPerMile: pace('8:00'),
    hrBpm: 150,
    zone: { mode: 'computed', zone: 2 },
    rpe: 5,
    inclinePct: 0,
    advanceOnHr: false,
    ...overrides,
  }
}

export function rest(overrides: Partial<RestSpec> = {}): RestSpec {
  return {
    duration: time(120),
    where: 'on',
    onSpeedMph: 2.5,
    useHr: false,
    hrBpm: 120,
    advanceOnHr: false,
    ...overrides,
  }
}

function recovery(kind: Recovery['kind'], active: Partial<StepSpec>, restSpec: Partial<RestSpec> = {}): Recovery {
  return {
    kind,
    active: step({ paceSecPerMile: pace('8:00'), ...active }),
    rest: rest(restSpec),
  }
}

let counter = 0
export function newId(): string {
  counter = (counter + 1) % 1_000_000
  return `b${Date.now().toString(36)}${counter.toString(36)}${Math.random().toString(36).slice(2, 6)}`
}

export function createBlock(type: BlockType): Block {
  const id = newId()
  switch (type) {
    case 'warmup':
    case 'cooldown':
      return { id, type, step: step({ duration: time(600), paceSecPerMile: pace('8:30') }) }
    case 'steady':
      return { id, type, step: step({ duration: time(1200), paceSecPerMile: pace('6:00') }) }
    case 'activeRecovery':
      return { id, type, step: step({ duration: time(180), paceSecPerMile: pace('8:00') }) }
    case 'rest':
      return { id, type, rest: rest() }
    case 'strides':
      return {
        id,
        type,
        reps: 4,
        work: step({ duration: time(15), paceSecPerMile: pace('5:00') }),
        recovery: recovery('rest', { duration: time(75) }, { duration: time(75) }),
        restAfterFinal: false,
      }
    case 'intervals':
      return {
        id,
        type,
        reps: 4,
        work: step({ duration: time(180), paceSecPerMile: pace('6:00') }),
        recovery: recovery('active', { duration: time(90) }, { duration: time(90) }),
        restAfterFinal: false,
      }
    case 'hills':
      return {
        id,
        type,
        reps: 6,
        work: step({ duration: time(60), paceSecPerMile: pace('6:40'), inclinePct: 4 }),
        recovery: recovery('active', { duration: time(90), inclinePct: 0 }, { duration: time(90) }),
        restAfterFinal: false,
      }
    case 'nested':
      return {
        id,
        type,
        sets: 3,
        reps: 4,
        work: step({ duration: time(60), paceSecPerMile: pace('5:30') }),
        recovery: recovery('active', { duration: time(60) }, { duration: time(60) }),
        setRecovery: recovery('active', { duration: time(180) }, { duration: time(180) }),
        restAfterFinal: false,
      }
  }
}

export function emptyPlan(): WorkoutPlan {
  return { schemaVersion: 1, name: 'Untitled workout', blocks: [] }
}
