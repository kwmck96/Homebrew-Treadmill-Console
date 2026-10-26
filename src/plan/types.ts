/**
 * Structured workouts (H4): what the builder edits and the library stores.
 *
 * A plan is a list of blocks (Warmup, Intervals, ...). Blocks expand into a
 * flat list of steps (see expand.ts), which is what estimates and, in a later
 * phase, the workout runner use.
 *
 * Paces are stored as entered (seconds per mile, whatever unit the user typed
 * in). The belt only moves in 0.1 mph steps, so the speed actually commanded
 * is rounded when the plan is expanded.
 */

export type Duration = { kind: 'time'; seconds: number } | { kind: 'distance'; meters: number }

/** Mutually exclusive targets. Incline is separate and always combinable. */
export type TargetKind = 'pace' | 'hr' | 'zone' | 'rpe'

/**
 * HR zone: either one of the 5 zones from Max/Resting HR (heart-rate reserve,
 * 50–60 / 60–70 / 70–80 / 80–90 / 90–100 %), or custom bounds.
 */
export type ZoneSpec =
  | { mode: 'computed'; zone: 1 | 2 | 3 | 4 | 5 }
  | { mode: 'custom'; lowBpm: number; highBpm: number }

/**
 * A running step. Every target's value is kept even when another target is
 * selected, so switching back and forth in the editor doesn't lose numbers.
 */
export interface StepSpec {
  duration: Duration
  targetKind: TargetKind
  /** Pace target, or the starting pace for HR / zone / effort targets. */
  paceSecPerMile: number
  /** HR target; the accepted range is ±4 %. */
  hrBpm: number
  zone: ZoneSpec
  /** Perceived effort, 1–10. */
  rpe: number
  inclinePct: number
  /**
   * Recovery steps with an HR target only: start the next rep 5 s after HR
   * falls to the target. The step's duration becomes the maximum.
   */
  advanceOnHr: boolean
}

/** Standing or walking rest. Not a running step: it has no pace target. */
export interface RestSpec {
  duration: Duration
  /**
   * on: the belt slows to `onSpeedMph` and distance keeps logging.
   * off: you step off; the belt runs at the next rep's speed and distance
   * stops logging until the next rep starts. Time-based only.
   */
  where: 'on' | 'off'
  onSpeedMph: number
  /** Optional HR target during the rest. */
  useHr: boolean
  hrBpm: number
  /** Start the next rep 5 s after HR falls to `hrBpm`; duration is the maximum. */
  advanceOnHr: boolean
}

/** Recovery between reps. Both variants are kept so switching is lossless. */
export interface Recovery {
  kind: 'active' | 'rest'
  active: StepSpec
  rest: RestSpec
}

export type SingleBlockType = 'warmup' | 'steady' | 'activeRecovery' | 'cooldown'
export type RepeatBlockType = 'strides' | 'intervals' | 'hills'
export type BlockType = SingleBlockType | RepeatBlockType | 'nested' | 'rest'

export interface SingleBlock {
  id: string
  type: SingleBlockType
  step: StepSpec
}

export interface RestBlock {
  id: string
  type: 'rest'
  rest: RestSpec
}

export interface RepeatBlock {
  id: string
  type: RepeatBlockType
  reps: number
  work: StepSpec
  recovery: Recovery
  /** Include the recovery after the final rep. */
  restAfterFinal: boolean
}

/** Intervals, with the whole set repeated. */
export interface NestedBlock {
  id: string
  type: 'nested'
  sets: number
  reps: number
  work: StepSpec
  recovery: Recovery
  /** Recovery between sets (replaces the rep recovery after a set's last rep). */
  setRecovery: Recovery
  /** Include a recovery after the final rep of the final set. */
  restAfterFinal: boolean
}

export type Block = SingleBlock | RestBlock | RepeatBlock | NestedBlock

export interface WorkoutPlan {
  schemaVersion: 1
  name: string
  blocks: Block[]
}

/** Resting and max HR, for computed zones. */
export interface HrProfile {
  maxHr: number
  restHr: number
}
