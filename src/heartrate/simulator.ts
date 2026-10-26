import { DEFAULT_HR_PROFILE, type HeartRateProfile, steadyStateHr, stepHr } from './model'
import type { HeartRateListener, HeartRateSource, HeartRateState } from './types'

/**
 * A pretend chest strap. Unlike a real strap it needs to know what the
 * treadmill is doing, so the console store calls `feed()` on every tick.
 */
export class SimulatedHeartRate implements HeartRateSource {
  readonly name = 'Simulated HR'
  readonly isSimulated = true

  private listeners = new Set<HeartRateListener>()
  private state: HeartRateState = { connection: 'disconnected', bpm: null }
  private trueBpm: number
  /** Small random wander so the line doesn't look machine-drawn. */
  private wander = 0
  private readonly profile: HeartRateProfile
  private readonly random: () => number

  constructor(options: { profile?: HeartRateProfile; random?: () => number } = {}) {
    this.profile = options.profile ?? DEFAULT_HR_PROFILE
    this.random = options.random ?? Math.random
    this.trueBpm = this.profile.restBpm + 15 // standing, about to start
  }

  async connect(): Promise<void> {
    this.state = { connection: 'connected', bpm: Math.round(this.trueBpm) }
    this.emit()
  }

  async disconnect(): Promise<void> {
    this.state = { connection: 'disconnected', bpm: null }
    this.emit()
  }

  getState(): HeartRateState {
    return this.state
  }

  subscribe(listener: HeartRateListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /** Advance the model by `dtMs` given the belt's actual speed and incline. */
  feed(speedMph: number, inclinePct: number, dtMs: number): void {
    const dtSec = dtMs / 1000
    const target = steadyStateHr(speedMph, inclinePct, this.profile)
    this.trueBpm = stepHr(this.trueBpm, target, dtSec, this.profile)
    // Bounded random walk of ±3 bpm.
    this.wander += (this.random() - 0.5) * 0.8 * Math.min(1, dtSec * 4)
    this.wander = Math.max(-3, Math.min(3, this.wander * 0.98))
    if (this.state.connection !== 'connected') return
    const bpm = Math.round(this.trueBpm + this.wander)
    if (bpm !== this.state.bpm) {
      this.state = { connection: 'connected', bpm }
      this.emit()
    }
  }

  private emit() {
    for (const l of this.listeners) l(this.state)
  }
}
