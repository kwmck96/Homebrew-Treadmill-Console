/**
 * A real heart-rate sensor over Bluetooth LE (requirement H1), via the
 * @capacitor-community/bluetooth-le plugin: native Bluetooth inside the APK,
 * Web Bluetooth in desktop Chrome (handy for testing on the Mac).
 *
 * Uses the standard Heart Rate Service, so any strap or optical sensor that
 * broadcasts it works: Polar Verity Sense, COROS watches in "Broadcast HR"…
 *
 * Behaviour:
 * - Remembers the paired sensor and reconnects to it on launch and whenever
 *   the link drops (inside the APK, every few seconds until it's back).
 * - A reading older than 5 s counts as no reading (sensor off the arm, out
 *   of range), so a stale number never sits on screen.
 * - Readings without skin contact count as no reading.
 */
import { BleClient } from '@capacitor-community/bluetooth-le'
import { Capacitor } from '@capacitor/core'
import { HR_MEASUREMENT, HR_SERVICE, parseHrMeasurement } from './hrMeasurement'
import type { HeartRateListener, HeartRateSource, HeartRateState } from './types'

export interface PairedSensor {
  id: string
  name: string
}

const RETRY_MS = 4000
const STALE_MS = 5000

let initialized: Promise<void> | null = null
function ensureInit(): Promise<void> {
  initialized ??= BleClient.initialize({ androidNeverForLocation: true }).catch((e) => {
    initialized = null
    throw e
  })
  return initialized
}

export class BluetoothHeartRate implements HeartRateSource {
  readonly name = 'Bluetooth HR'
  readonly isSimulated = false

  private listeners = new Set<HeartRateListener>()
  private state: HeartRateState = { connection: 'disconnected', bpm: null }
  private sensor: PairedSensor | null
  /** Connect was asked for (and not since cancelled): keep reconnecting. */
  private wanted = false
  private retryTimer: ReturnType<typeof setTimeout> | null = null
  private staleTimer: ReturnType<typeof setTimeout> | null = null

  constructor(sensor: PairedSensor | null) {
    this.sensor = sensor
  }

  get pairedSensor(): PairedSensor | null {
    return this.sensor
  }

  getState(): HeartRateState {
    return this.state
  }

  subscribe(listener: HeartRateListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /**
   * Show the system list of nearby heart-rate sensors and connect to the one
   * picked. Returns the sensor, or null if cancelled or blocked (the reason
   * is in the state's `detail`).
   */
  async pair(): Promise<PairedSensor | null> {
    try {
      await ensureInit()
      if (Capacitor.isNativePlatform()) {
        if (!(await BleClient.isEnabled())) await BleClient.requestEnable()
        // Android 9 (Fire OS 7) only returns scan results with Location on.
        if (!(await BleClient.isLocationEnabled())) {
          this.setState({
            ...this.state,
            detail: 'Turn on Location in the tablet’s settings: Android needs it on to scan for Bluetooth sensors.',
            needsLocation: true,
          })
          return null
        }
      }
      const device = await BleClient.requestDevice({ services: [HR_SERVICE] })
      await this.disconnect()
      this.sensor = { id: device.deviceId, name: device.name ?? 'Heart-rate sensor' }
      await this.connect()
      return this.sensor
    } catch (e) {
      // Cancelling the picker lands here too.
      const message = e instanceof Error ? e.message : String(e)
      if (!/cancel/i.test(message)) this.setState({ ...this.state, detail: `Couldn’t pair: ${message}` })
      return null
    }
  }

  async connect(): Promise<void> {
    if (!this.sensor) {
      this.setState({ connection: 'disconnected', bpm: null, detail: 'No sensor paired yet.' })
      return
    }
    this.wanted = true
    await this.open()
  }

  async disconnect(): Promise<void> {
    this.wanted = false
    this.clearTimers()
    const id = this.sensor?.id
    if (id && this.state.connection !== 'disconnected') {
      await BleClient.disconnect(id).catch(() => {})
    }
    this.setState({ connection: 'disconnected', bpm: null })
  }

  /** Forget the paired sensor entirely. */
  async forget(): Promise<void> {
    await this.disconnect()
    this.sensor = null
  }

  private async open() {
    const sensor = this.sensor
    if (!sensor || !this.wanted) return
    this.clearTimers()
    this.setState({ connection: 'connecting', bpm: null, deviceName: sensor.name })
    try {
      await ensureInit()
      await BleClient.connect(sensor.id, () => this.onLinkLost(), { timeout: 10_000 })
      await BleClient.startNotifications(sensor.id, HR_SERVICE, HR_MEASUREMENT, (v) => this.onData(v))
      this.setState({ connection: 'connected', bpm: null, deviceName: sensor.name })
      this.armStale()
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      if (!Capacitor.isNativePlatform()) {
        // Web Bluetooth can't reconnect to a sensor from an earlier page load
        // without the picker, so stop and ask instead of retrying forever.
        this.wanted = false
        this.setState({
          connection: 'disconnected',
          bpm: null,
          deviceName: sensor.name,
          detail: 'Tap Pair to reconnect (the browser needs you to pick the sensor again).',
        })
        return
      }
      this.setState({
        connection: 'connecting',
        bpm: null,
        deviceName: sensor.name,
        detail: `Looking for ${sensor.name}… (${message}). Is it on and broadcasting?`,
      })
      this.retryTimer = setTimeout(() => void this.open(), RETRY_MS)
    }
  }

  private onLinkLost() {
    if (!this.wanted) return
    this.setState({ connection: 'connecting', bpm: null, deviceName: this.sensor?.name, detail: 'Lost the sensor; reconnecting…' })
    this.clearTimers()
    this.retryTimer = setTimeout(() => void this.open(), 1000)
  }

  private onData(value: DataView) {
    const m = parseHrMeasurement(value)
    if (!m) return
    const bpm = m.contact && m.bpm > 0 ? m.bpm : null
    this.armStale()
    if (bpm !== this.state.bpm || this.state.connection !== 'connected' || this.state.detail) {
      this.setState({ connection: 'connected', bpm, deviceName: this.sensor?.name })
    }
  }

  /** No packet for a while: show no reading rather than a frozen one. */
  private armStale() {
    if (this.staleTimer) clearTimeout(this.staleTimer)
    this.staleTimer = setTimeout(() => {
      if (this.state.bpm != null) this.setState({ ...this.state, bpm: null, detail: 'No reading from the sensor.' })
    }, STALE_MS)
  }

  private clearTimers() {
    if (this.retryTimer) clearTimeout(this.retryTimer)
    if (this.staleTimer) clearTimeout(this.staleTimer)
    this.retryTimer = this.staleTimer = null
  }

  private setState(state: HeartRateState) {
    this.state = state
    for (const l of this.listeners) l(state)
  }
}

/** Open the tablet's Location settings (Android). */
export async function openLocationSettings(): Promise<void> {
  if (Capacitor.isNativePlatform()) await BleClient.openLocationSettings().catch(() => {})
}

/** Bluetooth sensors are reachable here: the APK, or a browser with Web Bluetooth. */
export function bluetoothAvailable(): boolean {
  return Capacitor.isNativePlatform() || (typeof navigator !== 'undefined' && 'bluetooth' in navigator)
}
