import type { TreadmillLimits } from './types'

/**
 * Precor TRM 885 published ranges: 0.5–16 mph in 0.1 mph steps, −3 % to 15 %
 * grade in 0.5 % steps. The −3 % decline is not yet confirmed on Kyle's V1
 * unit, so the app lets the minimum be raised to 0 % in settings.
 *
 * These limits are for the UI's convenience (greying out buttons, clamping
 * what we send). Per the requirements, the controller firmware enforces the
 * real hard limits (S3); the app is never the safety boundary.
 */
export const TRM885_LIMITS: TreadmillLimits = {
  minSpeedMph: 0.5,
  maxSpeedMph: 16,
  speedStepMph: 0.1,
  minInclinePct: -3,
  maxInclinePct: 15,
  inclineStepPct: 0.5,
}

/** Round to the nearest multiple of `step`, avoiding float noise like 7.000000001. */
export function quantize(value: number, step: number): number {
  const decimals = Math.max(0, Math.ceil(-Math.log10(step)) + 1)
  return Number((Math.round(value / step) * step).toFixed(decimals))
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function clampSpeed(mph: number, limits: TreadmillLimits): number {
  return quantize(clamp(mph, limits.minSpeedMph, limits.maxSpeedMph), limits.speedStepMph)
}

export function clampIncline(pct: number, limits: TreadmillLimits): number {
  return quantize(clamp(pct, limits.minInclinePct, limits.maxInclinePct), limits.inclineStepPct)
}
