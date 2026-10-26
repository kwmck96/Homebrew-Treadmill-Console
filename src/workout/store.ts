/**
 * The console store: connects the treadmill driver, the workout engine and
 * storage, and exposes the actions the UI calls. React components read from
 * it with `useConsole(selector)`; the timer loop lives here, not in React.
 */
import { create } from 'zustand'
import { SimulatedHeartRate } from '../heartrate/simulator'
import type { HeartRateSource, HeartRateState } from '../heartrate/types'
import { useSettings } from '../settings/store'
import { clampIncline, clampSpeed, TRM885_LIMITS } from '../treadmill/limits'
import { SimulatedTreadmill } from '../treadmill/simulator'
import type { TreadmillDriver, TreadmillLimits, TreadmillState } from '../treadmill/types'
import * as engine from './engine'
import { advancePendingLap, type PendingLap, startPendingLap } from './pendingLap'
import { archiveWorkout, clearActiveWorkout, loadActiveWorkout, saveActiveWorkout } from './persistence'
import type { PauseReason, WorkoutRecord } from './types'

/** How often the workout clock and distance are updated. */
const TICK_MS = 250
/** How often the in-progress workout is written to storage (M9). */
const SAVE_EVERY_MS = 3000
/**
 * Largest slice of simulated time integrated in one step. Keeps the 1 Hz
 * samples intact when the simulator runs faster than real time.
 */
const MAX_SUBSTEP_MS = 1000

/** Simulator-only: how many times faster than real time the simulation runs. */
export type SimTimeScale = 1 | 10 | 30

interface ConsoleState {
  ready: boolean
  treadmill: TreadmillState
  heartRate: HeartRateState
  /** 1 on real hardware. Above 1 only while testing with the simulator. */
  simTimeScale: SimTimeScale
  workout: WorkoutRecord | null
  /**
   * The speed shown on the Charts view's wheel. Follows the belt's target
   * while it's running; turns freely (without moving the belt) otherwise.
   */
  dialMph: number
  /**
   * A preset-triggered lap waiting for the belt/deck to reach the new
   * targets plus a 3 s countdown. Null when none is pending.
   */
  pendingLap: PendingLap | null
  /** The finished workout whose summary is on screen (M8). */
  summary: WorkoutRecord | null
}

interface ConsoleActions {
  init: () => Promise<void>
  startWorkout: () => Promise<void>
  pauseWorkout: () => Promise<void>
  resumeWorkout: () => Promise<void>
  /** On-screen STOP (S6): stop the belt now and pause. Convenience only. */
  stopNow: () => Promise<void>
  endWorkout: () => Promise<void>
  discardWorkout: () => Promise<void>
  lap: (trigger?: 'manual' | 'preset') => void
  dismissSummary: () => void
  setSpeed: (mph: number) => void
  nudgeSpeed: (deltaMph: number) => void
  setIncline: (pct: number) => void
  nudgeIncline: (deltaPct: number) => void
  setSimTimeScale: (scale: SimTimeScale) => void
  /** Wheel turned: drives the belt while running, otherwise just moves the dial. */
  setDial: (mph: number) => void
  /** A preset was tapped: go to it, splitting a lap first if `lap` is set. */
  jumpToPreset: (kind: 'speed' | 'incline', presetId: string, lap: boolean) => void
  /** "Do not start new lap": drop the pending lap, keep the new speed/incline. */
  cancelPendingLap: () => void
}

// ---- driver selection ----------------------------------------------------
// The only place that decides which hardware backend to use. When the ESP32
// bridge exists, its driver gets chosen here (e.g. from a setting).
const driver: TreadmillDriver = new SimulatedTreadmill()
// Same for heart rate: a Bluetooth strap source replaces this later (H1).
const heartRateSource: HeartRateSource = new SimulatedHeartRate()

export function getDriver(): TreadmillDriver {
  return driver
}

export function getHeartRateSource(): HeartRateSource {
  return heartRateSource
}

export function effectiveLimits(): TreadmillLimits {
  return { ...TRM885_LIMITS, minInclinePct: useSettings.getState().minInclinePct }
}

// ---- module-level loop state (not rendered, so not in the store) ----------
let tickTimer: ReturnType<typeof setInterval> | null = null
let lastTick = 0
let lastSave = 0
/**
 * True between asking the belt to start and seeing it running. Prevents the
 * "belt stopped on its own" check from pausing a workout that is just starting.
 */
let awaitingBeltStart = false
let awaitingSince = 0
/** If the belt hasn't started this long after Start/Resume, pause the workout. */
const BELT_START_TIMEOUT_MS = 5000

function beginAwaitingBelt() {
  awaitingBeltStart = true
  awaitingSince = performance.now()
}

export const useConsole = create<ConsoleState & ConsoleActions>()((set, get) => {
  const now = () => Date.now()

  /** Apply a workout change, persist it immediately, and publish it. */
  function commit(workout: WorkoutRecord | null) {
    set({ workout })
    lastSave = performance.now()
    if (workout) void saveActiveWorkout(workout)
  }

  function pauseFor(reason: PauseReason) {
    const { workout } = get()
    if (!workout) return
    // Any stop cancels a pending preset lap; the next lap starts on resume.
    if (get().pendingLap) set({ pendingLap: null })
    const next = engine.pause(workout, reason, now())
    if (next !== workout) commit(next)
  }

  function onTreadmill(state: TreadmillState) {
    set({ treadmill: state })
    if (state.belt === 'running') awaitingBeltStart = false
    // Keep the wheel on whatever the belt was last told to do.
    if (
      state.belt === 'running' &&
      state.connection === 'connected' &&
      state.targetSpeedMph > 0 &&
      state.targetSpeedMph !== get().dialMph
    ) {
      set({ dialMph: state.targetSpeedMph })
    }

    const { workout } = get()
    if (!workout || workout.status !== 'running') return
    if (state.safetyStop) pauseFor('safetyStop')
    else if (state.connection !== 'connected') pauseFor('connectionLost')
    else if (state.belt !== 'running' && !awaitingBeltStart) {
      // Belt stopped without the app asking (e.g. a physical stop button, S5).
      pauseFor('user')
    }
  }

  function tick() {
    const t = performance.now()
    const realDt = t - lastTick
    const dt = realDt * get().simTimeScale
    lastTick = t
    const { treadmill } = get()
    // The simulated strap needs to know what the belt is doing.
    const feedHr = (ms: number) => {
      if (heartRateSource instanceof SimulatedHeartRate) {
        heartRateSource.feed(treadmill.actualSpeedMph, treadmill.actualInclinePct, ms)
      }
    }

    const { workout } = get()
    if (!workout || workout.status === 'finished') {
      feedHr(dt)
      if (get().pendingLap) set({ pendingLap: null })
      return
    }

    if (awaitingBeltStart && t - awaitingSince > BELT_START_TIMEOUT_MS) {
      // The belt never started (command lost, hardware refused). Don't let the
      // clock run against a stationary belt.
      awaitingBeltStart = false
      if (workout.status === 'running' && treadmill.belt !== 'running') {
        pauseFor('user')
        return
      }
    }

    let next = workout
    for (let left = dt; left > 0; left -= MAX_SUBSTEP_MS) {
      const step = Math.min(left, MAX_SUBSTEP_MS)
      feedHr(step)
      const reading = {
        actualSpeedMph: treadmill.actualSpeedMph,
        actualInclinePct: treadmill.actualInclinePct,
        connected: treadmill.connection === 'connected',
        heartRateBpm: get().heartRate.bpm,
      }
      next = engine.advance(next, reading, step, now())
    }
    set({ workout: next })

    // Pending preset lap: follow the estimated ramp, then the countdown.
    const pending = get().pendingLap
    if (pending) {
      const driving =
        next.status === 'running' &&
        treadmill.belt === 'running' &&
        treadmill.connection === 'connected' &&
        !treadmill.safetyStop
      if (!driving) {
        set({ pendingLap: null })
      } else {
        const r = advancePendingLap(
          pending,
          { speedMph: treadmill.targetSpeedMph, inclinePct: treadmill.targetInclinePct },
          dt,
          realDt,
        )
        set({ pendingLap: r.pending })
        if (r.fireLap) {
          next = engine.addLap(next, now(), 'preset')
          commit(next)
        }
      }
    }

    if (t - lastSave >= SAVE_EVERY_MS) {
      lastSave = t
      void saveActiveWorkout(next)
    }
  }

  function canDrive(): boolean {
    const { workout, treadmill } = get()
    return (
      workout?.status === 'running' &&
      treadmill.connection === 'connected' &&
      treadmill.belt === 'running'
    )
  }

  return {
    ready: false,
    treadmill: driver.getState(),
    heartRate: heartRateSource.getState(),
    simTimeScale: 1,
    workout: null,
    dialMph:
      useSettings.getState().speedPresets.find((p) => p.id === 'recovery')?.value ??
      useSettings.getState().startSpeedMph,
    summary: null,
    pendingLap: null,

    async init() {
      if (get().ready) return
      driver.subscribe(onTreadmill)
      heartRateSource.subscribe((heartRate) => set({ heartRate }))

      // Crash recovery (M9): restore an in-progress workout as paused. The
      // belt is never restarted automatically (S4).
      const saved = await loadActiveWorkout()
      if (saved && saved.status !== 'finished') {
        set({ workout: engine.pause({ ...saved, status: 'running' }, 'recovered', now()) })
      }

      lastTick = performance.now()
      lastSave = lastTick
      tickTimer ??= setInterval(tick, TICK_MS)
      set({ ready: true })
      await Promise.all([driver.connect(), heartRateSource.connect()])
    },

    async startWorkout() {
      const { workout, treadmill } = get()
      if (workout || treadmill.connection !== 'connected' || treadmill.safetyStop) return
      beginAwaitingBelt()
      commit(engine.createWorkout(now()))
      await driver.start(useSettings.getState().startSpeedMph)
    },

    async pauseWorkout() {
      pauseFor('user')
      await driver.stop()
    },

    async resumeWorkout() {
      const { workout, treadmill } = get()
      if (!workout || workout.status !== 'paused') return
      if (treadmill.connection !== 'connected' || treadmill.safetyStop) return
      // Wait for the belt to finish stopping so Resume always starts from rest
      // at walking speed rather than catching a decelerating belt.
      if (treadmill.belt !== 'stopped') return
      beginAwaitingBelt()
      commit(engine.resume(workout, now()))
      await driver.start(useSettings.getState().startSpeedMph)
    },

    async stopNow() {
      pauseFor('user')
      await driver.stop()
    },

    async endWorkout() {
      const { workout } = get()
      if (!workout) return
      await driver.stop()
      const finished = engine.finish(workout, now())
      set({ workout: null, summary: finished, pendingLap: null })
      await archiveWorkout(finished)
    },

    async discardWorkout() {
      await driver.stop()
      set({ workout: null, pendingLap: null })
      await clearActiveWorkout()
    },

    lap(trigger = 'manual') {
      const { workout } = get()
      if (!workout || workout.status === 'finished') return
      // A manual lap takes over from any pending preset lap.
      if (trigger === 'manual' && get().pendingLap) set({ pendingLap: null })
      commit(engine.addLap(workout, now(), trigger))
    },

    dismissSummary() {
      set({ summary: null })
    },

    setSpeed(mph) {
      if (!canDrive()) return
      void driver.setSpeed(clampSpeed(mph, effectiveLimits()))
    },

    nudgeSpeed(delta) {
      // Step from the target, not the actual speed, so rapid taps accumulate
      // even while the belt is still catching up.
      get().setSpeed(get().treadmill.targetSpeedMph + delta)
    },

    setIncline(pct) {
      if (!canDrive()) return
      void driver.setIncline(clampIncline(pct, effectiveLimits()))
    },

    nudgeIncline(delta) {
      get().setIncline(get().treadmill.targetInclinePct + delta)
    },

    setDial(mph) {
      const value = clampSpeed(mph, effectiveLimits())
      set({ dialMph: value })
      if (canDrive()) void driver.setSpeed(value)
    },

    jumpToPreset(kind, presetId, lap) {
      if (!canDrive()) return
      const { speedPresets, inclinePresets } = useSettings.getState()
      const preset = (kind === 'speed' ? speedPresets : inclinePresets).find((p) => p.id === presetId)
      if (!preset) return
      const limits = effectiveLimits()
      const value =
        kind === 'speed' ? clampSpeed(preset.value, limits) : clampIncline(preset.value, limits)

      // The lap waits for the ramp (pendingLap.ts). A tap while one is already
      // pending re-targets it, even if this preset's lap-on-tap is off.
      const { treadmill: t, pendingLap } = get()
      if (lap || pendingLap) {
        set({
          pendingLap: startPendingLap(
            pendingLap,
            { speedMph: t.actualSpeedMph, inclinePct: t.actualInclinePct },
            {
              speedMph: kind === 'speed' ? value : t.targetSpeedMph,
              inclinePct: kind === 'incline' ? value : t.targetInclinePct,
            },
            { speedMph: t.targetSpeedMph, inclinePct: t.targetInclinePct },
          ),
        })
      }
      if (kind === 'speed') get().setSpeed(value)
      else get().setIncline(value)
    },

    cancelPendingLap() {
      set({ pendingLap: null })
    },

    setSimTimeScale(scale) {
      if (!(driver instanceof SimulatedTreadmill)) return
      driver.timeScale = scale
      set({ simTimeScale: scale })
    },
  }
})

// Keep the simulator's limits in sync with the decline setting.
useSettings.subscribe((s, prev) => {
  if (s.minInclinePct !== prev.minInclinePct && driver instanceof SimulatedTreadmill) {
    driver.setLimits(effectiveLimits())
  }
})
