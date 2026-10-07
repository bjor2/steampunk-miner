/**
 * How the pacing bot researches nodes (ticket 211's purchase seam, wired for the #212 spend
 * guard): after its own Upgrade bay purchases it tries the nodes it could research now, new
 * capabilities and combos before Marks, cheapest first. `isAvailable` is the authority's own
 * refusal check, so the bot never sends a node the tree would refuse.
 */
import type { AuthorityState } from '../../../systems/authority/authorityState'
import { cmp, ZERO_MONEY, type Money } from '../../../systems/money'
import type { BotPurchase } from '../../../systems/registries/botPurchases'
import { nodeCost, nodeCostOf } from './nodeCost'
import type { TreeNode } from './techNode'
import { UNLOCK_NODE_COMMAND } from './techTreeCommands'
import { availableNodes, unlockRefusalOf } from './unlockRules'

interface ResearchPayload {
  nodeId: string
}

export const RESEARCH_BOT_PURCHASE: BotPurchase = {
  id: 'tech-tree.research',
  command: UNLOCK_NODE_COMMAND,
  payloadsToTry: (state, playerId) =>
    researchOrderOf(availableNodes(state, playerId), state.planet.index).map(payloadOf),
  estimateCost: (state, _playerId, args) => estimatedCostOf(state, args as ResearchPayload),
  isAvailable: (state, playerId, args) =>
    unlockRefusalOf(state, playerId, (args as ResearchPayload).nodeId) === null,
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
