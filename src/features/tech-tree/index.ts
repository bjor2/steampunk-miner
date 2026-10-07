/**
 * The tech tree slice's public API (docs/standards/feature-slices.md 2.1, spec #161 section 5):
 * the content types the lane slices register, the reads the store and the item slices use, and
 * the Mark rotation each item's `statPreview` steps through. The only file another slice may
 * import from this folder. The mounted gear and power-up effect looks (#166) are read-only
 * presentation rules the wiring draws from.
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
export type {
  CrateRack,
  DeployTiming,
  FxKind,
  GearKind,
  GearPart,
  MountedGear,
  PartPose,
  PowerUpFx,
} from './systems/render/techGear'
export {
  CRATE_RACK,
  DEPLOY_TIMING,
  GAUGE_CLUSTER,
  MOUNTED_GEAR,
  POWER_UP_FX,
  gearAssetIds,
  gearPartIdsOf,
  mountedGearOf,
  powerUpFxOf,
  powerUpFxOfItem,
} from './systems/render/techGear'
export { deployFractionOf, isMovingPart, partPoseAt } from './systems/render/extractorPose'
export type { GearQuad, MountedItem } from './systems/render/techGearQuads'
export {
  gearAttachIdOf,
  mountedGearQuadsOf,
  mountedItemsOf,
  vehicleGearQuadsOf,
} from './systems/render/techGearQuads'
export type { FxFrame } from './systems/render/powerUpFx'
export {
  flareShellPointOf,
  fxFrameOf,
  fxFrameOfId,
  isStanding,
  magnetVerbOf,
} from './systems/render/powerUpFx'
