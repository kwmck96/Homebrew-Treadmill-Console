import { describe, expect, it } from 'vitest'
import { tapeOffsetPx, valueFromDrag } from './wheelMath'

describe('speed wheel geometry', () => {
  it('dragging the tape left speeds up, right slows down', () => {
    expect(valueFromDrag(7, -130, 130, 0.5, 16)).toBeCloseTo(8)
    expect(valueFromDrag(7, 65, 130, 0.5, 16)).toBeCloseTo(6.5)
  })

  it('stops at the treadmill limits', () => {
    expect(valueFromDrag(15.5, -1000, 130, 0.5, 16)).toBe(16)
    expect(valueFromDrag(1, 1000, 130, 0.5, 16)).toBe(0.5)
  })

  it('puts the current value under the centre marker', () => {
    expect(tapeOffsetPx(7, 0, 130)).toBe(-910)
  })
})
