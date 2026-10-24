import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { addLap, advance, createWorkout, finish } from './engine'
import {
  archiveWorkout,
  listWorkouts,
  loadActiveWorkout,
  loadWorkout,
  saveActiveWorkout,
} from './persistence'

describe('persistence', () => {
  it('round-trips the active workout and archives it on finish', async () => {
    let r = createWorkout(1000, 'w-test')
    for (let i = 0; i < 20; i++) {
      r = advance(r, { actualSpeedMph: 6, actualInclinePct: 1, connected: true }, 250, 1000)
    }
    r = addLap(r, 1000)
    await saveActiveWorkout(r)
    expect(await loadActiveWorkout()).toEqual(r)

    const done = finish(r, 2000)
    await archiveWorkout(done)
    expect(await loadActiveWorkout()).toBeUndefined()
    expect(await loadWorkout('w-test')).toEqual(done)
    const index = await listWorkouts()
    expect(index[0]).toMatchObject({ id: 'w-test', laps: 2 })
  })
})
