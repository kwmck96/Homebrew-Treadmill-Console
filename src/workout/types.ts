export type WorkoutStatus = 'running' | 'paused' | 'finished'

/**
 * Why the workout is paused:
 * - `user`: pause button or on-screen STOP
 * - `safetyStop`: lanyard pulled
 * - `connectionLost`: link to the treadmill dropped
 * - `recovered`: the app restarted mid-workout and restored it from storage
 */
export type PauseReason = 'user' | 'safetyStop' | 'connectionLost' | 'recovered'

export interface Lap {
  /** 1-based lap number. */
  index: number
  trigger: 'start' | 'manual' | 'auto' | 'step'
  startElapsedMs: number
  startDistanceM: number
  startElevGainM: number
  startElevLossM: number
  /** Set when the lap is closed. The last lap stays open until the workout ends. */
  endElapsedMs?: number
  endDistanceM?: number
  endElevGainM?: number
  endElevLossM?: number
}

/** One-second snapshot, used for charts and the future .fit export (L3). */
export interface Sample {
  /** Elapsed (moving) time in ms. */
  t: number
  speedMph: number
  inclinePct: number
  distanceM: number
  /** Heart rate in bpm, when a strap was connected. */
  hr?: number
}

/**
 * The internal record of a workout (M9). This is the source of truth; any
 * export format (.fit, etc.) is generated from it later.
 */
export interface WorkoutRecord {
  schemaVersion: 1
  id: string
  /** Epoch ms. */
  startedAt: number
  endedAt?: number
  updatedAt: number
  status: WorkoutStatus
  pauseReason?: PauseReason
  /** Moving time: accumulates only while status is `running`. */
  elapsedMs: number
  distanceM: number
  elevGainM: number
  elevLossM: number
  laps: Lap[]
  samples: Sample[]
}
