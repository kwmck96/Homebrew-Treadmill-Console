/**
 * The workout being built. Persisted in localStorage so a half-built workout
 * survives closing the app; the library (library.ts) holds saved ones.
 */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { createBlock, emptyPlan, newId } from './defaults'
import type { Block, BlockType, WorkoutPlan } from './types'

interface BuilderState {
  plan: WorkoutPlan
  /** Set when the draft was loaded from (or saved to) the library. */
  libraryId: string | null
  /** Changed since the last load or save. */
  dirty: boolean
  /** Block open in the editor panel. */
  selectedId: string | null
}

interface BuilderActions {
  /** Add a block at `index` (default: the end) and select it. */
  addBlock: (type: BlockType, index?: number) => void
  moveBlock: (from: number, to: number) => void
  updateBlock: (id: string, update: (b: Block) => Block) => void
  removeBlock: (id: string) => void
  duplicateBlock: (id: string) => void
  select: (id: string | null) => void
  rename: (name: string) => void
  setDisableAutoLap: (disabled: boolean) => void
  reset: () => void
  load: (plan: WorkoutPlan, libraryId: string | null) => void
  markSaved: (libraryId: string, name: string) => void
}

export const useBuilder = create<BuilderState & BuilderActions>()(
  persist(
    (set) => ({
      plan: emptyPlan(),
      libraryId: null,
      dirty: false,
      selectedId: null,

      addBlock: (type, index) =>
        set((s) => {
          const block = createBlock(type)
          const blocks = [...s.plan.blocks]
          blocks.splice(index ?? blocks.length, 0, block)
          return { plan: { ...s.plan, blocks }, selectedId: block.id, dirty: true }
        }),

      moveBlock: (from, to) =>
        set((s) => {
          if (from === to) return s
          const blocks = [...s.plan.blocks]
          const [moved] = blocks.splice(from, 1)
          blocks.splice(to, 0, moved)
          return { plan: { ...s.plan, blocks }, dirty: true }
        }),

      updateBlock: (id, update) =>
        set((s) => ({
          plan: { ...s.plan, blocks: s.plan.blocks.map((b) => (b.id === id ? update(b) : b)) },
          dirty: true,
        })),

      removeBlock: (id) =>
        set((s) => ({
          plan: { ...s.plan, blocks: s.plan.blocks.filter((b) => b.id !== id) },
          selectedId: s.selectedId === id ? null : s.selectedId,
          dirty: true,
        })),

      duplicateBlock: (id) =>
        set((s) => {
          const i = s.plan.blocks.findIndex((b) => b.id === id)
          if (i < 0) return s
          const copy = { ...structuredClone(s.plan.blocks[i]), id: newId() }
          const blocks = [...s.plan.blocks]
          blocks.splice(i + 1, 0, copy)
          return { plan: { ...s.plan, blocks }, selectedId: copy.id, dirty: true }
        }),

      select: (selectedId) => set({ selectedId }),

      rename: (name) => set((s) => ({ plan: { ...s.plan, name }, dirty: true })),
      setDisableAutoLap: (disableAutoLap) =>
        set((s) => ({ plan: { ...s.plan, disableAutoLap }, dirty: true })),

      reset: () => set({ plan: emptyPlan(), libraryId: null, dirty: false, selectedId: null }),

      load: (plan, libraryId) =>
        set({ plan: structuredClone(plan), libraryId, dirty: false, selectedId: null }),

      markSaved: (libraryId, name) =>
        set((s) => ({ libraryId, dirty: false, plan: { ...s.plan, name } })),
    }),
    { name: 'htc-builder', version: 1 },
  ),
)
