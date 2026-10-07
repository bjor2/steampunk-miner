/**
 * The tech tree slice's public API (docs/standards/feature-slices.md 2.1, spec #161 section 5):
 * the content types the lane slices register, the reads the store and the item slices use, and
 * the Mark rotation each item's `statPreview` steps through. The only file another slice may
 * import from this folder.
 */
export const TECH_TREE_SLICE_ID = 'tech-tree'
export type {
  DiscoveryRequirement,
  ItemUnlock,
  MarkLadder,
  ProgressionLabel,
  TechComboTemplate,
  TechCostKind,
  TechLane,
  TechNode,
  TechNodeKind,
  TechNodeLane,
  TreeNode,
} from './systems/techNode'
export { TECH_LANES } from './systems/techNode'
export { isMasteredAt, lastMarkOf, markStepOf } from './systems/markLadder'
export type { MarkStatName, MarkStats, MarkStep } from './systems/markLadder'
export { nodeCostOf } from './systems/nodeCost'
export {
  availableNodes,
  isUnlocked,
  unlockedItems,
  type TechNodeRefusal,
} from './systems/unlockRules'
export { UNLOCK_NODE_COMMAND } from './systems/techTreeCommands'
