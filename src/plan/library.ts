/**
 * Saved workouts, in IndexedDB (its own database, separate from recordings).
 */
import { createStore, del, get, set, values, type UseStore } from 'idb-keyval'
import { newId } from './defaults'
import type { WorkoutPlan } from './types'

export interface LibraryEntry {
  id: string
  name: string
  plan: WorkoutPlan
  updatedAt: number
}

let store: UseStore | undefined
let lastStamp = 0
/** Strictly increasing, so saves in the same millisecond still sort. */
function stamp(): number {
  lastStamp = Math.max(Date.now(), lastStamp + 1)
  return lastStamp
}
function db(): UseStore {
  store ??= createStore('homebrew-treadmill-library', 'plans')
  return store
}

/** Newest first. */
export async function listLibrary(): Promise<LibraryEntry[]> {
  const all = await values<LibraryEntry>(db())
  return all.sort((a, b) => b.updatedAt - a.updatedAt)
}

/**
 * Save a plan. With `id`, overwrites that entry ("Save"); without, creates a
 * new one ("Add to library" / "Save as new"). Returns the entry id.
 */
export async function saveToLibrary(plan: WorkoutPlan, name: string, id?: string): Promise<string> {
  const entry: LibraryEntry = {
    id: id ?? newId(),
    name,
    plan: { ...structuredClone(plan), name },
    updatedAt: stamp(),
  }
  await set(entry.id, entry, db())
  return entry.id
}

export async function loadFromLibrary(id: string): Promise<LibraryEntry | undefined> {
  return get<LibraryEntry>(id, db())
}

export async function deleteFromLibrary(id: string): Promise<void> {
  await del(id, db())
}
