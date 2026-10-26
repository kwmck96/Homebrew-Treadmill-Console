/**
 * Heart-rate colour when no HR target is set (Kyle, 2026-10-26):
 * white at ≤100 bpm → green 120 → blue 140 → yellow 160 → orange 170 →
 * red at ≥180, blended smoothly between those points.
 */
const STOPS: [number, [number, number, number]][] = [
  [100, [238, 241, 236]], // chalk white
  [120, [82, 201, 122]], // green
  [140, [77, 163, 255]], // blue
  [160, [255, 216, 77]], // yellow
  [170, [255, 154, 60]], // orange
  [180, [240, 72, 78]], // red
]

export function hrColor(bpm: number | null): string | undefined {
  if (bpm == null) return undefined
  if (bpm <= STOPS[0][0]) return rgb(STOPS[0][1])
  for (let i = 1; i < STOPS.length; i++) {
    const [hi, cHi] = STOPS[i]
    if (bpm <= hi) {
      const [lo, cLo] = STOPS[i - 1]
      const t = (bpm - lo) / (hi - lo)
      return rgb(cLo.map((c, k) => c + (cHi[k] - c) * t) as [number, number, number])
    }
  }
  return rgb(STOPS[STOPS.length - 1][1])
}

function rgb([r, g, b]: [number, number, number]): string {
  return `rgb(${Math.round(r)} ${Math.round(g)} ${Math.round(b)})`
}
