import { clampIncline, clampSpeed, quantize, TRM885_LIMITS } from './limits'
import type {
  BeltState,
  ConnectionState,
  TreadmillDriver,
  TreadmillLimits,
  TreadmillListener,
  TreadmillState,
} from './types'

/**
 * Ramp rates for the simulated belt and incline motor.
 *
 * PLACEHOLDERS: these are guesses, not measurements. Replace them with values
 * timed on the real TRM 885 (e.g. stopwatch the belt from 1 to 10 mph, and the
 * deck from 0 % to 15 %). They only affect how the simulator behaves; the real
 * driver will report actual values from the hardware.
 */
export interface SimulatorRates {
  accelMphPerSec: number
  decelMphPerSec: number
  /** Deceleration after a lanyard pull. Real behavior is set by the lower board. */
  safetyDecelMphPerSec: number
  inclinePctPerSec: number
}

export const DEFAULT_SIM_RATES: SimulatorRates = {
  accelMphPerSec: 1.0, // placeholder
  decelMphPerSec: 1.5, // placeholder
  safetyDecelMphPerSec: 4.0, // placeholder
  inclinePctPerSec: 0.5, // placeholder (≈30 s from 0 % to 15 %)
}

export interface SimulatorOptions {
  rates?: Partial<SimulatorRates>
  limits?: TreadmillLimits
  /** Run an internal timer. Tests turn this off and call `advance()` directly. */
  autoTick?: boolean
  tickMs?: number
  /** Delay before `connect()` reports connected, to exercise the "connecting" UI. */
  connectDelayMs?: number
  now?: () => number
}

/** Below this the simulated belt is considered stopped. */
const STOPPED_EPSILON_MPH = 0.05

export class SimulatedTreadmill implements TreadmillDriver {
  readonly name = 'Simulator'
  readonly isSimulated = true
  limits: TreadmillLimits

  private rates: SimulatorRates
  private listeners = new Set<TreadmillListener>()
  private timer: ReturnType<typeof setInterval> | null = null
  private lastTick: number
  private readonly autoTick: boolean
  private readonly tickMs: number
  private readonly connectDelayMs: number
  private readonly now: () => number

  // Physical state of the simulated machine. It keeps evolving even while the
  // app is "disconnected", the same way a real treadmill would.
  private connection: ConnectionState = 'disconnected'
  private belt: BeltState = 'stopped'
  private targetSpeed = 0
  private actualSpeed = 0
  private targetIncline = 0
  private actualIncline = 0
  private safetyStop = false

  // What the app last saw. Frozen while disconnected, because a real app gets
  // no updates when the link is down.
  private published: TreadmillState

  constructor(options: SimulatorOptions = {}) {
    this.rates = { ...DEFAULT_SIM_RATES, ...options.rates }
    this.limits = options.limits ?? TRM885_LIMITS
    this.autoTick = options.autoTick ?? true
    this.tickMs = options.tickMs ?? 100
    this.connectDelayMs = options.connectDelayMs ?? 400
    this.now = options.now ?? (() => performance.now())
    this.lastTick = this.now()
    this.published = this.snapshot()
  }

  // ---- TreadmillDriver -------------------------------------------------

  async connect(): Promise<void> {
    if (this.connection === 'connected') return
    this.connection = 'connecting'
    this.publish(true)
    if (this.connectDelayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.connectDelayMs))
    }
    this.connection = 'connected'
    this.lastTick = this.now()
    this.startTimer()
    this.publish(true)
  }

  async disconnect(): Promise<void> {
    this.loseConnection()
    this.stopTimer()
  }

  getState(): TreadmillState {
    return this.published
  }

  subscribe(listener: TreadmillListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  async start(speedMph: number): Promise<void> {
    if (this.connection !== 'connected' || this.safetyStop) return
    if (this.belt === 'running') return
    this.belt = 'running'
    this.targetSpeed = clampSpeed(speedMph, this.limits)
    this.publish(true)
  }

  async setSpeed(speedMph: number): Promise<void> {
    if (this.connection !== 'connected' || this.belt !== 'running') return
    this.targetSpeed = clampSpeed(speedMph, this.limits)
    this.publish(true)
  }

  async setIncline(inclinePct: number): Promise<void> {
    if (this.connection !== 'connected' || this.belt !== 'running') return
    this.targetIncline = clampIncline(inclinePct, this.limits)
    this.publish(true)
  }

  async stop(): Promise<void> {
    if (this.belt === 'stopped') return
    this.belt = 'stopping'
    this.targetSpeed = 0
    this.publish(true)
  }

  // ---- Simulator-only controls (for testing the UI) ---------------------

  /** Pretend the lanyard was pulled. */
  simulateSafetyStop(): void {
    this.safetyStop = true
    if (this.belt !== 'stopped') this.belt = 'stopping'
    this.targetSpeed = 0
    this.publish(true)
  }

  /** Pretend the lanyard magnet was put back. The belt stays stopped (S4). */
  resetSafetyStop(): void {
    this.safetyStop = false
    this.publish(true)
  }

  /**
   * Pretend the app ↔ controller link dropped. Mirrors requirement S2: the
   * controller ramps the belt down on its own.
   */
  simulateConnectionLoss(): void {
    this.loseConnection()
  }

  setLimits(limits: TreadmillLimits): void {
    this.limits = limits
    this.targetIncline = clampIncline(this.targetIncline, limits)
    this.publish(true)
  }

  /** Step the physics by `dtMs`. Called by the internal timer, or by tests. */
  advance(dtMs: number): void {
    const dt = dtMs / 1000

    // Belt speed: ramp toward target at the appropriate rate.
    const speedRate =
      this.targetSpeed >= this.actualSpeed
        ? this.rates.accelMphPerSec
        : this.safetyStop
          ? this.rates.safetyDecelMphPerSec
          : this.rates.decelMphPerSec
    this.actualSpeed = approach(this.actualSpeed, this.targetSpeed, speedRate * dt)

    if (this.belt === 'stopping' && this.actualSpeed <= STOPPED_EPSILON_MPH) {
      this.actualSpeed = 0
      this.belt = 'stopped'
    }

    // Incline motor: ramps at a fixed rate. It keeps moving to its target even
    // after the belt stops, as a real lift motor would finish its travel.
    this.actualIncline = approach(
      this.actualIncline,
      this.targetIncline,
      this.rates.inclinePctPerSec * dt,
    )

    this.publish(false)
  }

  // ---- internals --------------------------------------------------------

  private loseConnection(): void {
    if (this.belt !== 'stopped') this.belt = 'stopping'
    this.targetSpeed = 0
    this.connection = 'disconnected'
    // Publish once so the app learns the link is gone; after that the
    // published snapshot is frozen until reconnect.
    this.publish(true)
  }

  private startTimer(): void {
    if (!this.autoTick || this.timer) return
    this.timer = setInterval(() => {
      const t = this.now()
      const dt = t - this.lastTick
      this.lastTick = t
      this.advance(dt)
    }, this.tickMs)
  }

  private stopTimer(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  private snapshot(): TreadmillState {
    return {
      connection: this.connection,
      belt: this.belt,
      targetSpeedMph: quantize(this.targetSpeed, 0.1),
      actualSpeedMph: this.actualSpeed,
      targetInclinePct: this.targetIncline,
      actualInclinePct: this.actualIncline,
      safetyStop: this.safetyStop,
      timestamp: this.now(),
    }
  }

  /**
   * @param force publish even while disconnected (used for the transition
   * messages themselves).
   */
  private publish(force: boolean): void {
    if (this.connection !== 'connected' && !force) return
    if (this.connection === 'disconnected' && force) {
      // The app only learns about the disconnect, not the physical state.
      this.published = { ...this.published, connection: 'disconnected', timestamp: this.now() }
    } else {
      this.published = this.snapshot()
    }
    for (const listener of this.listeners) listener(this.published)
  }
}

/** Move `current` toward `target` by at most `maxDelta`. */
function approach(current: number, target: number, maxDelta: number): number {
  if (current < target) return Math.min(target, current + maxDelta)
  if (current > target) return Math.max(target, current - maxDelta)
  return current
}
