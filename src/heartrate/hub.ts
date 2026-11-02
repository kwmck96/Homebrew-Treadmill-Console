/**
 * The heart-rate source the app listens to. Wraps either the simulated
 * strap or a Bluetooth sensor and can switch between them at any time; the
 * console store subscribes to the hub once and never needs to know which.
 */
import { BluetoothHeartRate, type PairedSensor } from './bluetooth'
import { SimulatedHeartRate } from './simulator'
import type { HeartRateListener, HeartRateSource, HeartRateState } from './types'

export type HeartRateMode = 'simulated' | 'bluetooth'

export class HeartRateHub implements HeartRateSource {
  readonly simulated = new SimulatedHeartRate()
  readonly bluetooth: BluetoothHeartRate
  private active: HeartRateSource
  private unsubscribe: () => void
  private listeners = new Set<HeartRateListener>()
  private connected = false

  constructor(mode: HeartRateMode, sensor: PairedSensor | null) {
    this.bluetooth = new BluetoothHeartRate(sensor)
    this.active = mode === 'bluetooth' ? this.bluetooth : this.simulated
    this.unsubscribe = this.active.subscribe((s) => this.emit(s))
  }

  get name() {
    return this.active.name
  }

  get isSimulated() {
    return this.active.isSimulated
  }

  get mode(): HeartRateMode {
    return this.active === this.bluetooth ? 'bluetooth' : 'simulated'
  }

  /** The simulated strap while it's the one in use (the store feeds it the belt's speed). */
  get simulatedSource(): SimulatedHeartRate | null {
    return this.active === this.simulated ? this.simulated : null
  }

  async use(mode: HeartRateMode): Promise<void> {
    const next = mode === 'bluetooth' ? this.bluetooth : this.simulated
    if (next === this.active) return
    this.unsubscribe()
    await this.active.disconnect()
    this.active = next
    this.unsubscribe = next.subscribe((s) => this.emit(s))
    this.emit(next.getState())
    if (this.connected) await next.connect()
  }

  async connect(): Promise<void> {
    this.connected = true
    await this.active.connect()
  }

  async disconnect(): Promise<void> {
    this.connected = false
    await this.active.disconnect()
  }

  getState(): HeartRateState {
    return this.active.getState()
  }

  subscribe(listener: HeartRateListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private emit(state: HeartRateState) {
    for (const l of this.listeners) l(state)
  }
}
