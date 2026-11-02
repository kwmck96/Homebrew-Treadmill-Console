import { describe, expect, it } from 'vitest'
import { parseHrMeasurement } from './hrMeasurement'

const view = (bytes: number[]) => new DataView(new Uint8Array(bytes).buffer)

describe('Heart Rate Measurement parsing', () => {
  it('uint8 value, no contact feature', () => {
    expect(parseHrMeasurement(view([0x00, 142]))).toEqual({ bpm: 142, contact: true, rrMs: [] })
  })
  it('uint16 value', () => {
    expect(parseHrMeasurement(view([0x01, 0x2c, 0x01]))?.bpm).toBe(300)
  })
  it('contact supported but not detected', () => {
    expect(parseHrMeasurement(view([0x04, 0]))?.contact).toBe(false)
    expect(parseHrMeasurement(view([0x06, 120]))?.contact).toBe(true)
  })
  it('skips energy expended and reads RR intervals', () => {
    // flags: energy (0x08) + RR (0x10); bpm 150; energy 0x0010; RR 1024 → 1000 ms, 512 → 500 ms
    const m = parseHrMeasurement(view([0x18, 150, 0x10, 0x00, 0x00, 0x04, 0x00, 0x02]))
    expect(m).toEqual({ bpm: 150, contact: true, rrMs: [1000, 500] })
  })
  it('rejects truncated packets', () => {
    expect(parseHrMeasurement(view([0x00]))).toBeNull()
    expect(parseHrMeasurement(view([0x01, 0x10]))).toBeNull()
  })
})
