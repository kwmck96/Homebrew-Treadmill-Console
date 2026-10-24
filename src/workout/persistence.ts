/**
 * Workout storage in IndexedDB (via idb-keyval). IndexedDB survives app
 * restarts and reloads in both the browser and the Capacitor WebView.
 *
 * Keys:
 * - `active-workout`      the in-progress workout, rewritten every few seconds
 * - `workout:<id>`        each finished workout, in full
 * - `workout-index`       lightweight summaries of finished workouts, newest first
 */
import { createStore, del, get, set, type UseStore } from 'idb-keyval'
import type { WorkoutRecord } from './types'

const ACTIVE_KEY = 'active-workout'
const INDEX_KEY = 'workout-index'

export interface WorkoutSummary {
  id: string
  startedAt: number
  endedAt?: number
  elapsedMs: number
  distanceM: number
  elevGainM: number
  laps: number
}

let store: UseStore | undefined
function db(): UseStore {
  // Created lazily so importing this module never touches IndexedDB (tests,
  // server-side tooling).
  store ??= createStore('homebrew-treadmill', 'workouts')
  return store
}

export async function saveActiveWorkout(record: WorkoutRecord): Promise<void> {
  await set(ACTIVE_KEY, record, db())
}

export async function loadActiveWorkout(): Promise<WorkoutRecord | undefined> {
  return get<WorkoutRecord>(ACTIVE_KEY, db())
}

export async function clearActiveWorkout(): Promise<void> {
  await del(ACTIVE_KEY, db())
}

/** Store a finished workout and remove it from the active slot. */
export async function archiveWorkout(record: WorkoutRecord): Promise<void> {
  await set(`workout:${record.id}`, record, db())
  const index = (await get<WorkoutSummary[]>(INDEX_KEY, db())) ?? []
  const summary: WorkoutSummary = {
    id: record.id,
    startedAt: record.startedAt,
    endedAt: record.endedAt,
    elapsedMs: record.elapsedMs,
    distanceM: record.distanceM,
    elevGainM: record.elevGainM,
    laps: record.laps.length,
  }
  await set(INDEX_KEY, [summary, ...index.filter((s) => s.id !== record.id)], db())
  await clearActiveWorkout()
}

export async function listWorkouts(): Promise<WorkoutSummary[]> {
  return (await get<WorkoutSummary[]>(INDEX_KEY, db())) ?? []
}

export async function loadWorkout(id: string): Promise<WorkoutRecord | undefined> {
  return get<WorkoutRecord>(`workout:${id}`, db())
}
