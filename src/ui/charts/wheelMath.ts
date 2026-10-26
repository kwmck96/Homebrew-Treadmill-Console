/**
 * Geometry for the speed wheel: a horizontal tape of tick marks that slides
 * under a fixed centre marker. Dragging the tape left brings higher numbers to
 * the centre, like turning a dial clockwise.
 */

/** Value under the centre marker after dragging `dxPx` from `startValue`. */
export function valueFromDrag(
  startValue: number,
  dxPx: number,
  pxPerUnit: number,
  min: number,
  max: number,
): number {
  const raw = startValue - dxPx / pxPerUnit
  return Math.min(max, Math.max(min, raw))
}

/** Horizontal offset of the tape so that `value` sits under the centre. */
export function tapeOffsetPx(value: number, min: number, pxPerUnit: number): number {
  return -(value - min) * pxPerUnit
}
