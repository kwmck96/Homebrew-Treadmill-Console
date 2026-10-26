import { describe, expect, it } from 'vitest'
import { hrColor } from './hrColor'

describe('hrColor', () => {
  it('hits each named colour at its bpm and clamps outside the range', () => {
    expect(hrColor(90)).toBe('rgb(238 241 236)')
    expect(hrColor(120)).toBe('rgb(82 201 122)')
    expect(hrColor(140)).toBe('rgb(77 163 255)')
    expect(hrColor(160)).toBe('rgb(255 216 77)')
    expect(hrColor(170)).toBe('rgb(255 154 60)')
    expect(hrColor(195)).toBe('rgb(240 72 78)')
    expect(hrColor(null)).toBeUndefined()
  })

  it('blends between neighbours', () => {
    expect(hrColor(130)).toBe('rgb(80 182 189)') // halfway green → blue
  })
})
