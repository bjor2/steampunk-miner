/**
 * When a node can be researched (spec #161 sections 1 and 5). In order, a node is refused when
 * no node has the id, it is already researched, its tier is not reached, it waits on a discovery
 * (`locked_tier` / `undiscovered`), a prerequisite is missing, the player does not own what it
 * `requiresOwned` (`not_owned`, ticket 233), it is a combo and the `research_lab` is not built,
 * or the wallet is short.
 *
 * The tier is the furthest planet the session has travelled to: the one it is on. A node with a
 * discovery key opens at its tier once the key is met and at tier + `discoveryGrace` regardless,
 * so the tree never stalls on the RNG; with no discovery provider the kernel answers "met at the
 * unlock tier" (TD). Discovery is read through the kernel query, never the codex.
 */
import type { AuthorityState } from '../../../systems/authority/authorityState'
import { isFeatureUnlocked } from '../../../systems/authority/featureUnlocks'
import { cmp } from '../../../systems/money'
import { hasDiscovered } from '../../../systems/registries/discovery'
import { progressFromTravel } from '../../../systems/unlocks/travelUnlocks'
import { nodeCost } from './nodeCost'
import { ownsEveryRequirement } from './ownedRequirement'
import { isAbsorbedRowReached, RESEARCH_LAB_ROW_ID } from './scheduleAbsorber'
import { registeredTechTree, treeNodeOf, treeNodesThrough, type TechTree } from './techTree'
import type { DiscoveryRequirement, ItemUnlock, TreeNode } from './techNode'
import { unlockedNodeIdsOf } from './techTreeSection'
import { TREE_ECONOMY } from './treeEconomy'

export const TECH_NODE_REFUSALS = [
  'unknown_node',
  'already_unlocked',
  'locked_tier',
  'undiscovered',
  'missing_prereq',
  'not_owned',
  'no_lab',
  'money_short',
] as const

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
  return researchRefusalOf(state, playerId, node) ?? moneyRefusalOf(state, playerId, node)
}

/** Why `node` cannot be researched now, the wallet aside; null when only money could stop it. */
export function researchRefusalOf(
  state: AuthorityState,
  playerId: string,
  node: TreeNode,
): TechNodeRefusal | null {
  const unlocked = new Set(unlockedNodeIdsOf(state, playerId))
  if (unlocked.has(node.id)) return 'already_unlocked'
  if (!isTierReached(state.planet.index, node)) return 'locked_tier'
  if (isWaitingOnDiscovery(state, playerId, node)) return 'undiscovered'
  if (node.prereqs.some((prereq) => !unlocked.has(prereq))) return 'missing_prereq'
  if (!ownsEveryRequirement(state, playerId, node.requiresOwned ?? [])) return 'not_owned'
  if (node.kind === 'combo' && !isFeatureUnlocked(state, RESEARCH_LAB_ROW_ID)) return 'no_lab'
  return null
}

/** The nodes the player could research now if the wallet allowed, earliest first. */
export function availableNodes(
  state: AuthorityState,
  playerId: string,
  tree: TechTree = registeredTechTree(),
): TreeNode[] {
  return treeNodesThrough(tree, state.planet.index).filter(
    (node) => researchRefusalOf(state, playerId, node) === null,
  )
}

export function isUnlocked(state: AuthorityState, playerId: string, nodeId: string): boolean {
  return unlockedNodeIdsOf(state, playerId).includes(nodeId)
}

/** Each store item the player researched, at its highest Mark or grade, by item id. */
export function unlockedItems(
  state: AuthorityState,
  playerId: string,
  tree: TechTree = registeredTechTree(),
): ItemUnlock[] {
  const highest = new Map<string, number>()
  unlockedNodeIdsOf(state, playerId)
    .flatMap((nodeId) => treeNodeOf(tree, nodeId)?.unlocks ?? [])
    .forEach(({ itemId, mark }) => highest.set(itemId, Math.max(mark, highest.get(itemId) ?? 0)))
  return [...highest.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([itemId, mark]) => ({ itemId, mark }))
}

/** Its own tier, and the planet of the Schedule C row it absorbs, if it absorbs one. */
function isTierReached(planetIndex: number, node: TreeNode): boolean {
  return planetIndex >= node.unlockTier && isAbsorbedRowReached(planetIndex, node.id)
}

function isWaitingOnDiscovery(state: AuthorityState, playerId: string, node: TreeNode): boolean {
  if (node.requiresDiscovery === undefined) return false
  if (state.planet.index >= node.unlockTier + TREE_ECONOMY.cadence.discoveryGrace) return false
  return !isRequirementMet(state, playerId, node, node.requiresDiscovery)
}

function isRequirementMet(
  state: AuthorityState,
  playerId: string,
  node: TreeNode,
  requirement: DiscoveryRequirement,
): boolean {
  const keys = typeof requirement === 'string' ? [requirement] : requirement.anyOf
  const fallback = {
    progress: progressFromTravel(state.planet.index),
    unlockPlanetIndex: node.unlockTier,
  }
  return keys.some((key) => hasDiscovered(state, playerId, key, fallback))
}

function moneyRefusalOf(
  state: AuthorityState,
  playerId: string,
  node: TreeNode,
): TechNodeRefusal | null {
  const cost = nodeCost(node, state.planet.index)
  return cmp(state.players[playerId].wallet, cost) >= 0 ? null : 'money_short'
}
