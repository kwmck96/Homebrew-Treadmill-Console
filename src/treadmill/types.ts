/**
 * The hardware abstraction layer.
 *
 * The UI only ever talks to a `TreadmillDriver`. Today that is the
 * `SimulatedTreadmill`; later it will be a driver for the ESP32 bridge
 * (BLE FTMS and/or WebSocket). Nothing outside `src/treadmill/` should know
 * which one is in use.
 *
 * Units: speed is in mph and incline in percent grade, because those are the
 * TRM 885's native control units (0.1 mph and 0.5 % steps). Keeping them
 * native avoids rounding drift from converting every button press. Display
 * conversion to km/h or pace happens in `src/lib/units.ts`.
 */

export type ConnectionState = 'disconnected' | 'connecting' | 'connected'

/**
 * - `stopped`: belt at rest.
 * - `running`: belt commanded to a speed (it may still be ramping toward it).
 * - `stopping`: belt decelerating to rest after a stop, safety stop, or
 *   connection loss.
 */
export type BeltState = 'stopped' | 'running' | 'stopping'

export interface TreadmillState {
  connection: ConnectionState
  belt: BeltState
  /** What the treadmill was last told to do. */
  targetSpeedMph: number
  /** What the belt is actually doing right now. */
  actualSpeedMph: number
  targetInclinePct: number
  actualInclinePct: number
  /**
   * True while the lanyard / E-stop is tripped. The belt will not start until
   * it is reset. On real hardware this is reported by the controller; the app
   * never decides it.
   */
  safetyStop: boolean
  /** performance.now()-style timestamp (ms) of this snapshot. */
  timestamp: number
}

export interface TreadmillLimits {
  minSpeedMph: number
  maxSpeedMph: number
  speedStepMph: number
  minInclinePct: number
  maxInclinePct: number
  inclineStepPct: number
}

export type TreadmillListener = (state: TreadmillState) => void

export interface TreadmillDriver {
  /** Human-readable name shown in the status bar ("Simulator", "ESP32 bridge"). */
  readonly name: string
  readonly isSimulated: boolean
  readonly limits: TreadmillLimits

  connect(): Promise<void>
  disconnect(): Promise<void>

  getState(): TreadmillState
  /** Called on every state change. Returns an unsubscribe function. */
  subscribe(listener: TreadmillListener): () => void

  /** Start the belt from rest at the given speed (expected to be a walking speed). */
  start(speedMph: number): Promise<void>
  /** Change target speed. Ignored unless the belt is running. */
  setSpeed(speedMph: number): Promise<void>
  /** Change target incline. Ignored unless the belt is running. */
  setIncline(inclinePct: number): Promise<void>
  /** Ramp the belt down to a stop. */
  stop(): Promise<void>
}
