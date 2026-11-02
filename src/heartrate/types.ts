/**
 * Heart-rate source abstraction (requirement H1). Today: a simulated strap.
 * Later: a Bluetooth LE Heart Rate Service (0x180D) strap via a Capacitor BLE
 * plugin. The workout store only ever sees `HeartRateState`.
 */
export type HeartRateConnection = 'disconnected' | 'connecting' | 'connected'

export interface HeartRateState {
  connection: HeartRateConnection
  /** Latest reading, or null when no strap is connected or it has no contact. */
  bpm: number | null
  /** Bluetooth: the sensor's name. */
  deviceName?: string
  /** A short explanation to show in Settings (searching, needs Location…). */
  detail?: string
  /** Pairing needs Android's Location switched on. */
  needsLocation?: boolean
}

export type HeartRateListener = (state: HeartRateState) => void

export interface HeartRateSource {
  readonly name: string
  readonly isSimulated: boolean
  connect(): Promise<void>
  disconnect(): Promise<void>
  getState(): HeartRateState
  subscribe(listener: HeartRateListener): () => void
}
