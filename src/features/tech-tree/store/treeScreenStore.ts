/**
 * The tree screen's own UI state (feature-slices.md 6.4: a slice keeps its UI state in its
 * `store/`, never in `GameState`): the zoom level, the focused lane, the selected node, the search
 * and the filters, and a revision the screen re-reads the authority on. Researching submits
 * `tech-tree.unlock_node` for the local player; the authority answers, and its events bump the
 * revision.
 */
import { create } from 'zustand'
import { submitCommand } from '../../../store/authorityLink'
import { useGameStore } from '../../../store/gameStore'
import { UNLOCK_NODE_COMMAND } from '../systems/techTreeCommands'
import type { TechNodeLane } from '../systems/techNode'
import type { TreeFilter } from '../systems/treeScreenModel'

/** Campaign overview, one lane's cards, or one node's card (#161 section 4, three levels). */
export type TreeZoom = 'overview' | 'lane' | 'card'

const ZOOM_LEVELS: readonly TreeZoom[] = ['overview', 'lane', 'card']

interface TreeScreenValues {
  zoom: TreeZoom
  /** The lane the lane zoom shows, and the tab a narrow screen shows. */
  lane: TechNodeLane
  selectedNodeId: string | null
  search: string
  filters: readonly TreeFilter[]
  /** Bumped by every tree event, so the screen reads the authority again. */
  revision: number
}

interface TreeScreenState extends TreeScreenValues {
  zoomIn(): void
  zoomOut(): void
  focusLane(lane: TechNodeLane): void
  /** A narrow screen's lane tab: the lane shown, at the same zoom. */
  showLaneTab(lane: TechNodeLane): void
  selectNode(nodeId: string): void
  setSearch(search: string): void
  toggleFilter(filter: TreeFilter): void
  noteTreeChanged(): void
  researchNode(nodeId: string): void
}

const STARTING_VALUES: TreeScreenValues = {
  zoom: 'overview',
  lane: 'extraction',
  selectedNodeId: null,
  search: '',
  filters: [],
  revision: 0,
}

export const useTreeScreenStore = create<TreeScreenState>()((set, get) => ({
  ...STARTING_VALUES,
  zoomIn: () => set({ zoom: zoomStepOf(get(), 1) }),
  zoomOut: () => set({ zoom: zoomStepOf(get(), -1) }),
  focusLane: (lane) => set({ lane, zoom: 'lane' }),
  showLaneTab: (lane) => set({ lane }),
  selectNode: (nodeId) => set({ selectedNodeId: nodeId, zoom: 'card' }),
  setSearch: (search) => set({ search }),
  toggleFilter: (filter) => set({ filters: toggledFilters(get().filters, filter) }),
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

/** One level in or out; the card zoom needs a selected node. */
function zoomStepOf(values: TreeScreenValues, step: 1 | -1): TreeZoom {
  const deepest = values.selectedNodeId === null ? 1 : ZOOM_LEVELS.length - 1
  const index = ZOOM_LEVELS.indexOf(values.zoom) + step
  return ZOOM_LEVELS[Math.min(Math.max(index, 0), deepest)]
}

function toggledFilters(filters: readonly TreeFilter[], filter: TreeFilter): TreeFilter[] {
  return filters.includes(filter) ? filters.filter((kept) => kept !== filter) : [...filters, filter]
}
