/**
 * When a node can be researched (spec #161 sections 1 and 5; price-only, Bjor's ruling on #411).
 * In order, a node is refused when no node has the id, it is already researched, it is a lane's
 * fork branch or a Mark of a branch the lane does not have active (`fork_branch`: the fork
 * commands open a branch, #255), a schedule row it `requiresFeature` or the `research_lab` it is
 * researched at ships nothing yet (`held_feature`: a vision row is never previewed), a
 * prerequisite is missing, the player does not own what it `requiresOwned` (`not_owned`, ticket
 * 233), or the wallet is short.
 *
 * Nothing here reads the planet the session is on: a node's `unlockTier` is only the anchor its
 * price is read from (`nodeCost`), so a player on planet 1 with the money researches any node whose
 * prerequisites are met, and the host answers every player alike. Discovery keys no longer wait
 * research: they shifted a planet lock that is gone.
 */
import type { AuthorityState } from '../../../systems/authority/authorityState'
import { isFeatureForSale } from '../../../systems/authority/featureSales'
import { cmp } from '../../../systems/money'
import { activeItemsOf, isLeftToForkChoice } from './forkBranches'
import { forkChoicesOf } from './forkSection'
import { nodeCost } from './nodeCost'
import { ownsEveryRequirement } from './ownedRequirement'
import { RESEARCH_LAB_ROW_ID } from './scheduleAbsorber'
import { registeredTechTree, researchFrontierOf, treeNodeOf, type TechTree } from './techTree'
import type { ItemUnlock, TreeNode } from './techNode'
import { unlockedNodeIdsOf } from './techTreeSection'

export const TECH_NODE_REFUSALS = [
  'unknown_node',
  'already_unlocked',
  'fork_branch',
  'held_feature',
  'missing_prereq',
  'not_owned',
  'money_short',
] as const

/**
 * The planet and lab locks #411 retired: logs written before it carry them, so the log schema
 * still reads them; no rule answers them any more.
 */
export const RETIRED_TECH_NODE_REFUSALS = ['locked_tier', 'undiscovered', 'no_lab'] as const

export type TechNodeRefusal = (typeof TECH_NODE_REFUSALS)[number]

/** Why `unlock_node` would be refused now; null when it would research the node. */
export function unlockRefusalOf(
  state: AuthorityState,
  playerId: string,
  nodeId: string,
  tree: TechTree = registeredTechTree(),
): TechNodeRefusal | null {
  const node = treeNodeOf(tree, nodeId)
  if (node === null) return 'unknown_node'
  return researchRefusalOf(state, playerId, node, tree) ?? moneyRefusalOf(state, playerId, node)
}

/** Why `node` cannot be researched now, the wallet aside; null when only money could stop it. */
export function researchRefusalOf(
  state: AuthorityState,
  playerId: string,
  node: TreeNode,
  tree: TechTree = registeredTechTree(),
): TechNodeRefusal | null {
  if (isUnlocked(state, playerId, node.id)) return 'already_unlocked'
  if (isLeftToForkChoice(tree, forkChoicesOf(state, playerId), node)) return 'fork_branch'
  return researchGateRefusalOf(state, playerId, node)
}

/**
 * Why a held feature, prerequisites or owned items stop `node` now: the gates a fork branch is
 * opened through too, by `choose_fork` and `rechoose_fork`.
 */
export function researchGateRefusalOf(
  state: AuthorityState,
  playerId: string,
  node: TreeNode,
): TechNodeRefusal | null {
  if (!isAnchorForSale(state, node)) return 'held_feature'
  if (!hasEveryPrereq(state, playerId, node)) return 'missing_prereq'
  if (!ownsEveryRequirement(state, playerId, node.requiresOwned ?? [])) return 'not_owned'
  return null
}

/** The nodes the player could research now if the wallet allowed, cheapest anchor first. */
export function availableNodes(
  state: AuthorityState,
  playerId: string,
  tree: TechTree = registeredTechTree(),
): TreeNode[] {
  const researched = new Set(unlockedNodeIdsOf(state, playerId))
  return researchFrontierOf(tree, researched).filter(
    (node) => researchRefusalOf(state, playerId, node, tree) === null,
  )
}

export function isUnlocked(state: AuthorityState, playerId: string, nodeId: string): boolean {
  return unlockedNodeIdsOf(state, playerId).includes(nodeId)
}

/**
 * Each store item the player researched, at its highest Mark or grade, by item id; an inactive
 * fork branch's item is not among them.
 */
export function unlockedItems(
  state: AuthorityState,
  playerId: string,
  tree: TechTree = registeredTechTree(),
): ItemUnlock[] {
  const researched = itemsUnlockedBy(unlockedNodeIdsOf(state, playerId), tree)
  return activeItemsOf(researched, tree, forkChoicesOf(state, playerId))
}

/** Each store item the researched `nodeIds` unlock, at its highest Mark or grade, by item id. */
export function itemsUnlockedBy(nodeIds: readonly string[], tree: TechTree): ItemUnlock[] {
  const highest = new Map<string, number>()
  nodeIds
    .flatMap((nodeId) => treeNodeOf(tree, nodeId)?.unlocks ?? [])
    .forEach(({ itemId, mark }) => highest.set(itemId, Math.max(mark, highest.get(itemId) ?? 0)))
  return [...highest.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([itemId, mark]) => ({ itemId, mark }))
}

/** Whether a researched node unlocked the store item, at any Mark or grade (ticket 248's store). */
export function isItemResearched(
  state: AuthorityState,
  playerId: string,
  itemId: string,
  tree: TechTree = registeredTechTree(),
): boolean {
  return unlockedItems(state, playerId, tree).some((unlock) => unlock.itemId === itemId)
}

/**
 * Whether every schedule row the node `requiresFeature`, and the `research_lab` it is researched
 * at, ships: a node anchored on a vision row is a held item, hidden from the screen and refused
 * (#318, ticket 358; HS on #411). A row's planet is never a lock.
 */
export function isAnchorForSale(state: AuthorityState, node: TreeNode): boolean {
  return anchorRowIdsOf(node).every((rowId) => isFeatureForSale(state, rowId))
}

function anchorRowIdsOf(node: TreeNode): readonly string[] {
  const features = node.requiresFeature ?? []
  return isResearchedAtLab(node) ? [...features, RESEARCH_LAB_ROW_ID] : features
}

function hasEveryPrereq(state: AuthorityState, playerId: string, node: TreeNode): boolean {
  const unlocked = new Set(unlockedNodeIdsOf(state, playerId))
  return node.prereqs.every((prereq) => unlocked.has(prereq))
}

function isResearchedAtLab(node: TreeNode): boolean {
  return node.kind === 'combo' || node.researchedAt === 'research_lab'
}

function moneyRefusalOf(
  state: AuthorityState,
  playerId: string,
  node: TreeNode,
): TechNodeRefusal | null {
  return cmp(state.players[playerId].wallet, nodeCost(node)) >= 0 ? null : 'money_short'
}
