/**
 * The Patent Office's own UI state (feature-slices.md 6.4: a slice keeps its UI state in its
 * `store/`, never in `GameState`): a revision the tab re-reads the authority on. Researching
 * submits `tech-tree.unlock_node` for the local player; the authority answers, and its events bump
 * the revision. The map's zoom, lanes, search and filters left with the tree screen (ticket 687).
 */
import { create } from 'zustand'
import { submitCommand } from '../../../store/authorityLink'
import { useGameStore } from '../../../store/gameStore'
import { UNLOCK_NODE_COMMAND } from '../systems/techTreeCommands'

interface TreeScreenValues {
  /** Bumped by every tree event, so the tab reads the authority again. */
  revision: number
}

interface TreeScreenState extends TreeScreenValues {
  noteTreeChanged(): void
  researchNode(nodeId: string): void
}

const STARTING_VALUES: TreeScreenValues = { revision: 0 }

export const useTreeScreenStore = create<TreeScreenState>()((set, get) => ({
  ...STARTING_VALUES,
  noteTreeChanged: () => set({ revision: get().revision + 1 }),
  researchNode: (nodeId) =>
    submitCommand(useGameStore.getState().playerId, {
      type: UNLOCK_NODE_COMMAND,
      payload: { nodeId },
    }),
}))

/** For specs' `beforeEach`. */
export function resetTreeScreenStore(): void {
  useTreeScreenStore.setState(STARTING_VALUES)
}
