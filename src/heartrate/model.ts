/**
 * A simple physiological heart-rate model used only by the simulator, so the
 * chart and lap averages have realistic-looking data before a real strap is
 * connected.
 *
 * 1. Oxygen cost from the ACSM metabolic equations (ml/kg/min):
 *      walking: VO2 = 0.1·S + 1.8·S·G + 3.5
 *      running: VO2 = 0.2·S + 0.9·S·G + 3.5
 *    S = speed in m/min, G = grade as a fraction. The ACSM equations aren't
 *    validated for decline, so negative grade gets half weight.
 * 2. Heart rate from %VO2 reserve ≈ %HR reserve (Swain & Leutholtz).
 * 3. First-order kinetics toward that steady state, faster on the way up than
 *    on the way down.
 *
 * Profile values are placeholders, not anyone's measured physiology.
 */

export interface HeartRateProfile {
  restBpm: number
  maxBpm: number
  /** ml/kg/min */
  vo2max: number
  /** Time constants for the exponential approach, in seconds. */
  tauUpSec: number
  tauDownSec: number
}

export const DEFAULT_HR_PROFILE: HeartRateProfile = {
  restBpm: 55,
  maxBpm: 190,
  vo2max: 68,
  tauUpSec: 25,
  tauDownSec: 40,
}

const METERS_PER_MIN_PER_MPH = 26.8224
/** ACSM uses the walking equation up to about 3.7 mph. */
const WALK_RUN_TRANSITION_MPH = 3.7
const RESTING_VO2 = 3.5

export function oxygenCost(speedMph: number, inclinePct: number): number {
  if (speedMph <= 0) return RESTING_VO2
  const s = speedMph * METERS_PER_MIN_PER_MPH
  const g = inclinePct >= 0 ? inclinePct / 100 : inclinePct / 200
  const walking = speedMph < WALK_RUN_TRANSITION_MPH
  const vo2 = walking ? 0.1 * s + 1.8 * s * g + RESTING_VO2 : 0.2 * s + 0.9 * s * g + RESTING_VO2
  return Math.max(RESTING_VO2, vo2)
}

export function steadyStateHr(
  speedMph: number,
  inclinePct: number,
  profile: HeartRateProfile = DEFAULT_HR_PROFILE,
): number {
  const vo2 = oxygenCost(speedMph, inclinePct)
  const reserveFraction = (vo2 - RESTING_VO2) / (profile.vo2max - RESTING_VO2)
  const hr = profile.restBpm + reserveFraction * (profile.maxBpm - profile.restBpm)
  return Math.min(profile.maxBpm, Math.max(profile.restBpm, hr))
}

/** Move `currentBpm` toward `targetBpm` over `dtSec` with first-order kinetics. */
export function stepHr(
  currentBpm: number,
  targetBpm: number,
  dtSec: number,
  profile: HeartRateProfile = DEFAULT_HR_PROFILE,
): number {
  const tau = targetBpm > currentBpm ? profile.tauUpSec : profile.tauDownSec
  const k = 1 - Math.exp(-dtSec / tau)
  return currentBpm + (targetBpm - currentBpm) * k
}
