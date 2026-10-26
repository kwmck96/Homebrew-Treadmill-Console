import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { useSettings } from '../settings/store'
import { createBlock, emptyPlan } from './defaults'
import { deleteFromLibrary, listLibrary, loadFromLibrary, saveToLibrary } from './library'
import { useBuilder } from './store'

describe('library', () => {
  it('saves, overwrites, saves as new, lists newest first, and deletes', async () => {
    const plan = { ...emptyPlan(), blocks: [createBlock('warmup')] }
    const id = await saveToLibrary(plan, 'Tuesday intervals')
    await saveToLibrary({ ...plan, blocks: [...plan.blocks, createBlock('cooldown')] }, 'Tuesday intervals', id)
    const copy = await saveToLibrary(plan, 'Copy')
    const list = await listLibrary()
    expect(list.map((e) => e.name)).toEqual(['Copy', 'Tuesday intervals'])
    expect((await loadFromLibrary(id))!.plan.blocks).toHaveLength(2)
    await deleteFromLibrary(copy)
    expect(await listLibrary()).toHaveLength(1)
  })
})

describe('builder draft', () => {
  beforeEach(() => useBuilder.getState().reset())

  it('adds at a position, moves, duplicates and removes blocks', () => {
    const b = useBuilder.getState()
    b.addBlock('warmup')
    b.addBlock('cooldown')
    b.addBlock('intervals', 1) // dropped between them
    const types = () => useBuilder.getState().plan.blocks.map((x) => x.type)
    expect(types()).toEqual(['warmup', 'intervals', 'cooldown'])
    b.moveBlock(2, 0)
    expect(types()).toEqual(['cooldown', 'warmup', 'intervals'])
    const id = useBuilder.getState().plan.blocks[2].id
    b.duplicateBlock(id)
    expect(types()).toEqual(['cooldown', 'warmup', 'intervals', 'intervals'])
    expect(useBuilder.getState().plan.blocks[3].id).not.toBe(id)
    b.removeBlock(id)
    expect(types()).toEqual(['cooldown', 'warmup', 'intervals'])
    expect(useBuilder.getState().dirty).toBe(true)
  })
})

describe('data field swap', () => {
  it('swaps when the chosen metric is already shown', () => {
    useSettings.getState().update({ dataFields: ['elapsed', 'heartRate', 'distance', 'lapTime', 'lapDistance', 'avgPace'] })
    useSettings.getState().setDataField(0, 'heartRate')
    expect(useSettings.getState().dataFields.slice(0, 2)).toEqual(['heartRate', 'elapsed'])
    useSettings.getState().setDataField(5, 'elevGain')
    expect(useSettings.getState().dataFields[5]).toBe('elevGain')
  })
})
