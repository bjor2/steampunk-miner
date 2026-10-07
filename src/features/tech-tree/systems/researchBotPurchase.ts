/**
 * How the pacing bot researches nodes (ticket 211's purchase seam, wired for the #212 spend
 * guard): after its own Upgrade bay purchases and the items the tree already unlocked, it tries
 * the nodes it could research now that unlock something it can buy (ticket 248, `itemShop.ts`),
 * new capabilities before Marks, cheapest first. `isAvailable` is the authority's own refusal
 * check, so the bot never sends a node the tree would refuse. A node whose item is due ahead of
 * the tracks (ticket 296, an extractor on its planet) is due too, once the tree would open it.
 */
import type { AuthorityState } from '../../../systems/authority/authorityState'
import { cmp, ZERO_MONEY, type Money } from '../../../systems/money'
import type { BotPurchase } from '../../../systems/registries/botPurchases'
import { dueItemIdsOf, unlocksSomethingToBuy } from './itemShop'
import { nodeCost, nodeCostOf } from './nodeCost'
import type { TreeNode } from './techNode'
import { UNLOCK_NODE_COMMAND } from './techTreeCommands'
import { registeredTechTree, treeNodesThrough } from './techTree'
import { availableNodes, isItemResearched, researchRefusalOf, unlockRefusalOf } from './unlockRules'

interface ResearchPayload {
  nodeId: string
}

export const RESEARCH_BOT_PURCHASE: BotPurchase = {
  id: 'tech-tree.research',
  command: UNLOCK_NODE_COMMAND,
  payloadsToTry: (state, playerId) =>
    researchOrderOf(nodesWorthResearching(state, playerId), state.planet.index).map(payloadOf),
  estimateCost: (state, _playerId, args) => estimatedCostOf(state, args as ResearchPayload),
  isAvailable: (state, playerId, args) =>
    unlockRefusalOf(state, playerId, (args as ResearchPayload).nodeId) === null,
  boughtIdOf: (args) => (args as ResearchPayload).nodeId,
  duePayloadsOf: (state, playerId) => nodesDueNow(state, playerId).map(payloadOf),
}

/** The nodes the tree would open now, money aside, that unlock an unresearched due item. */
function nodesDueNow(state: AuthorityState, playerId: string): TreeNode[] {
  const due = unresearchedDueItemIdsOf(state, playerId)
  if (due.size === 0) return []
  return treeNodesThrough(registeredTechTree(), state.planet.index).filter(
    (node) => due.has(node.unlocks.itemId) && researchRefusalOf(state, playerId, node) === null,
  )
}

function unresearchedDueItemIdsOf(state: AuthorityState, playerId: string): Set<string> {
  const due = [...dueItemIdsOf(state, playerId)]
  return new Set(due.filter((itemId) => !isItemResearched(state, playerId, itemId)))
}

/** The nodes open to research now whose item the bot could then buy. */
function nodesWorthResearching(state: AuthorityState, playerId: string): TreeNode[] {
  return availableNodes(state, playerId).filter((node) =>
    unlocksSomethingToBuy(state, playerId, node),
  )
}

/** New capabilities and combos first, then Marks; each group cheapest first, then by id. */
export function researchOrderOf(nodes: readonly TreeNode[], planetIndex: number): TreeNode[] {
  const priced = nodes.map((node) => ({ node, cost: nodeCost(node, planetIndex) }))
  return priced.sort(compareResearchPriority).map(({ node }) => node)
}

function compareResearchPriority(
  a: { node: TreeNode; cost: Money },
  b: { node: TreeNode; cost: Money },
): number {
  const byKind = kindRankOf(a.node) - kindRankOf(b.node)
  if (byKind !== 0) return byKind
  return cmp(a.cost, b.cost) || (a.node.id < b.node.id ? -1 : 1)
}

/** Something new before one more Mark. */
function kindRankOf(node: TreeNode): number {
  return node.kind === 'mark' ? 1 : 0
}

function payloadOf(node: TreeNode): ResearchPayload {
  return { nodeId: node.id }
}

function estimatedCostOf(state: AuthorityState, { nodeId }: ResearchPayload): Money {
  return nodeCostOf(nodeId, state.planet.index) ?? ZERO_MONEY
}
