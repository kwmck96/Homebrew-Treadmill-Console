/**
 * How fast the TRM 885 changes speed and incline.
 *
 * ESTIMATES, not measurements (Kyle, 2026-10-26): about 0.5 s per 1 mph and
 * about 0.5 s per 0.5 % grade. Replace with timed values from the real
 * treadmill. Used by:
 * - the pending-lap overlay, to estimate where the belt and deck are while
 *   they ramp (the hardware may not report it), and
 * - the simulator, so simulated ramps match the estimate.
 */
export const RAMP_RATES = {
  speedMphPerSec: 2,
  inclinePctPerSec: 1,
} as const
