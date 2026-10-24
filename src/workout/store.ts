/**
 * The console store: connects the treadmill driver, the workout engine and
 * storage, and exposes the actions the UI calls. React components read from
 * it with `useConsole(selector)`; the timer loop lives here, not in React.
 */
import { create } from 'zustand'
import { useSettings } from '../settings/store'
import { clampIncline, clampSpeed, TRM885_LIMITS } from '../treadmill/limits'
import { SimulatedTreadmill } from '../treadmill/simulator'
import type { TreadmillDriver, TreadmillLimits, TreadmillState } from '../treadmill/types'
import * as engine from './engine'
import { archiveWorkout, clearActiveWorkout, loadActiveWorkout, saveActiveWorkout } from './persistence'
import type { PauseReason, WorkoutRecord } from './types'

/** How often the workout clock and distance are updated. */
const TICK_MS = 250
/** How often the in-progress workout is written to storage (M9). */
const SAVE_EVERY_MS = 3000

interface ConsoleState {
  ready: boolean
  treadmill: TreadmillState
  workout: WorkoutRecord | null
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
  lap: () => void
  dismissSummary: () => void
  setSpeed: (mph: number) => void
  nudgeSpeed: (deltaMph: number) => void
  setIncline: (pct: number) => void
  nudgeIncline: (deltaPct: number) => void
}

// ---- driver selection ----------------------------------------------------
// The only place that decides which hardware backend to use. When the ESP32
// bridge exists, its driver gets chosen here (e.g. from a setting).
const driver: TreadmillDriver = new SimulatedTreadmill()

export function getDriver(): TreadmillDriver {
  return driver
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
    const next = engine.pause(workout, reason, now())
    if (next !== workout) commit(next)
  }

  function onTreadmill(state: TreadmillState) {
    set({ treadmill: state })
    if (state.belt === 'running') awaitingBeltStart = false

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
    const dt = t - lastTick
    lastTick = t
    const { workout, treadmill } = get()
    if (!workout || workout.status === 'finished') return

    if (awaitingBeltStart && t - awaitingSince > BELT_START_TIMEOUT_MS) {
      // The belt never started (command lost, hardware refused). Don't let the
      // clock run against a stationary belt.
      awaitingBeltStart = false
      if (workout.status === 'running' && treadmill.belt !== 'running') {
        pauseFor('user')
        return
      }
    }

    const next = engine.advance(
      workout,
      {
        actualSpeedMph: treadmill.actualSpeedMph,
        actualInclinePct: treadmill.actualInclinePct,
        connected: treadmill.connection === 'connected',
      },
      dt,
      now(),
    )
    set({ workout: next })
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
    workout: null,
    summary: null,

    async init() {
      if (get().ready) return
      driver.subscribe(onTreadmill)

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
      await driver.connect()
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
      set({ workout: null, summary: finished })
      await archiveWorkout(finished)
    },

    async discardWorkout() {
      await driver.stop()
      set({ workout: null })
      await clearActiveWorkout()
    },

    lap() {
      const { workout } = get()
      if (!workout || workout.status === 'finished') return
      commit(engine.addLap(workout, now()))
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
  }
})

// Keep the simulator's limits in sync with the decline setting.
useSettings.subscribe((s, prev) => {
  if (s.minInclinePct !== prev.minInclinePct && driver instanceof SimulatedTreadmill) {
    driver.setLimits(effectiveLimits())
  }
})
