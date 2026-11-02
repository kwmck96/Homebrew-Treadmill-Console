import { describe, expect, it } from 'vitest'
import { beep, countdownMarksCrossed, primeAudio, STEP_TONE } from './beeper'

describe('beeper', () => {
  it('counts the 3-2-1 marks crossed', () => {
    expect(countdownMarksCrossed(3100, 2900)).toBe(1)
    expect(countdownMarksCrossed(2900, 2100)).toBe(0)
    expect(countdownMarksCrossed(3500, 500)).toBe(3) // a long tick crosses all three
    expect(countdownMarksCrossed(800, 0)).toBe(0)
  })
  it('never throws without audio', () => {
    expect(() => {
      primeAudio()
      beep(STEP_TONE)
    }).not.toThrow()
  })
})
