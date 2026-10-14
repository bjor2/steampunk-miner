/**
 * The tech tree slice's public API (docs/standards/feature-slices.md 2.1, spec #161 section 5):
 * the content types the lane slices register, the reads the store and the item slices use, and
 * the Mark rotation each item's `statPreview` steps through, with its milestones and their card
 * line (#256), and the P16 fork each lane registers a pair for, with the branch it has active
 * (#255), with the part each branch hangs and the turntable beat a re-choice asks of the Works
 * (ticket 270). The only file another slice may import from this folder. The mounted gear and
 * power-up effect looks (#166) are read-only presentation rules the wiring draws from.
 */
export const TECH_TREE_SLICE_ID = 'tech-tree'
export type {
  ArmouryLane,
  ComboLane,
  DiscoveryRequirement,
  ItemUnlock,
  MarkLadder,
  MarkMilestone,
  MilestonePattern,
  ProgressionLabel,
  TechComboTemplate,
  TechCostKind,
  TechLane,
  TechNode,
  TechNodeKind,
  TechNodeLane,
  TreeNode,
} from './systems/techNode'
export { ARMOURY_LANES, isArmouryLane, TECH_LANES } from './systems/techNode'
export { RESEARCH_LAB_ROW_ID } from './systems/scheduleAbsorber'
export { isMasteredAt, lastMarkOf, markStepOf } from './systems/markLadder'
export { markOfNodeId } from './systems/markNodes'
export { markLadderOfItem, researchedMarkInViewOf, researchedMarkOf } from './systems/itemMarks'
export {
  isYieldMilestone,
  MILESTONE_MARKS,
  milestonesOf,
  nextMilestoneOf,
  reachedMilestonesOf,
  type MilestoneClass,
  type MilestoneVerbs,
} from './systems/markMilestones'
export { milestoneLineSpecsOf, nextMilestoneLineOf } from './systems/milestoneCardLine'
export type { MarkStatName, MarkStats, MarkStep } from './systems/markLadder'
export { nodeCostOf } from './systems/nodeCost'
export { laneSpendRowsOf, type LaneSpendRow } from './systems/laneSpend'
export { unlockTierOfItem } from './systems/itemUnlockTier'
export {
  availableNodes,
  isUnlocked,
  unlockedItems,
  type TechNodeRefusal,
} from './systems/unlockRules'
export { UNLOCK_NODE_COMMAND } from './systems/techTreeCommands'
export {
  FORK_TIER,
  forkPairOf,
  type ForkBranchSpec,
  type ForkNode,
  type ForkPair,
} from './systems/forkNode'
export { activeForkBranchOf } from './systems/forkSection'
export { withoutPacingBotForkPicks } from './forkPicksOff'
export { CHOOSE_FORK_COMMAND, RECHOOSE_FORK_COMMAND, type ForkPick } from './systems/forkCommands'
export { forkRechoicePriceOf, type ForkRefusal } from './systems/forkRules'
export { forkMountsOf, type ForkPiece } from './systems/render/forkPieces'
export { forkTurntableRequestsOf, type ForkTurntableRequest } from './systems/render/forkTurntable'
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
  fxLookOf,
  MILESTONE_FX_ELEMENTS,
  plainLookOf,
  type FxElement,
  type FxLook,
} from './systems/render/milestoneLook'
export {
  flareShellPointOf,
  fxFrameOf,
  fxFrameOfId,
  isStanding,
  magnetVerbOf,
} from './systems/render/powerUpFx'
