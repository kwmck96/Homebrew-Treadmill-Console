/**
 * Heart-rate coaching for steps with an HR or zone target (phase 3).
 *
 * - Reps: below the range is orange "Too Low", inside is green, above is
 *   red "Too High".
 * - Rest and recovery: the aim is to come down, so anything at or below the
 *   top of the range is good (green); above is "Too High".
 * - Zone targets also carry the zone number.
 */
import type { PlannedStep } from '../plan/expand'

export type HrStatus = 'low' | 'in' | 'high' | 'noSignal'

export interface HrCoaching {
  status: HrStatus
  label: string
  color: string
  low: number
  high: number
  /** "Zone 3" for computed zone targets. */
  zoneLabel: string | null
  /** Rest/recovery: lower is fine. */
  recovering: boolean
}

export const HR_COACH_COLORS = {
  low: 'rgb(255 154 60)', // orange
  in: 'rgb(82 201 122)', // green
  high: 'rgb(240 72 78)', // red
  noSignal: 'rgb(143 166 189)', // mist
} as const

/** Coaching for the current step, or null when it has no HR target. */
export function hrCoaching(step: PlannedStep | null | undefined, bpm: number | null): HrCoaching | null {
  if (!step?.hrRange || (step.targetKind !== 'hr' && step.targetKind !== 'zone')) return null
  const { low, high } = step.hrRange
  const recovering = !step.on
  const zoneLabel = step.zone != null ? `Zone ${step.zone}` : null
  const base = { low, high, zoneLabel, recovering }
  if (bpm == null) {
    return { ...base, status: 'noSignal', label: 'No heart rate', color: HR_COACH_COLORS.noSignal }
  }
  if (bpm > high) return { ...base, status: 'high', label: 'Too High', color: HR_COACH_COLORS.high }
  if (bpm < low && !recovering) return { ...base, status: 'low', label: 'Too Low', color: HR_COACH_COLORS.low }
  return { ...base, status: 'in', label: recovering ? 'Recovering' : 'On target', color: HR_COACH_COLORS.in }
}

/** The current step uses heart rate (a target or auto-advance), so a lost strap matters. */
export function stepNeedsHr(step: PlannedStep | null | undefined): boolean {
  return !!step && (step.advanceAtHr != null || step.targetKind === 'hr' || step.targetKind === 'zone')
}
