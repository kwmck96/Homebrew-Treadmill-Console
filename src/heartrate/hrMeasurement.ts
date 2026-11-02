/**
 * Bluetooth Heart Rate Service (0x180D) → Heart Rate Measurement (0x2A37).
 * This is the standard profile every strap and optical sensor broadcasts
 * (Polar Verity Sense, COROS "Broadcast HR", Garmin, Wahoo…), so nothing
 * here is brand-specific.
 *
 * Byte 0 is flags:
 *   bit 0    heart-rate value is uint16 (else uint8)
 *   bit 1    sensor contact detected
 *   bit 2    sensor contact feature supported
 *   bit 3    energy expended present (uint16)
 *   bit 4    RR intervals present (uint16 each, 1/1024 s)
 */
export const HR_SERVICE = '0000180d-0000-1000-8000-00805f9b34fb'
export const HR_MEASUREMENT = '00002a37-0000-1000-8000-00805f9b34fb'

export interface HrMeasurement {
  bpm: number
  /** False only when the sensor supports contact detection and reports none. */
  contact: boolean
  /** Beat-to-beat intervals in ms, when the sensor sends them. */
  rrMs: number[]
}

export function parseHrMeasurement(data: DataView): HrMeasurement | null {
  if (data.byteLength < 2) return null
  const flags = data.getUint8(0)
  const wide = (flags & 0x01) !== 0
  if (wide && data.byteLength < 3) return null
  const bpm = wide ? data.getUint16(1, true) : data.getUint8(1)
  const contactSupported = (flags & 0x04) !== 0
  const contact = !contactSupported || (flags & 0x02) !== 0
  let offset = wide ? 3 : 2
  if (flags & 0x08) offset += 2 // energy expended
  const rrMs: number[] = []
  if (flags & 0x10) {
    for (; offset + 1 < data.byteLength; offset += 2) {
      rrMs.push(Math.round((data.getUint16(offset, true) / 1024) * 1000))
    }
  }
  return { bpm, contact, rrMs }
}
