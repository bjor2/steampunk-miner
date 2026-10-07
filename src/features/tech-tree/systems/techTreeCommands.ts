/**
 * The tree's commands and events (spec #161 section 5, through K1's open lists):
 *
 * - `tech-tree.unlock_node {nodeId}`: researches the node, paying `nodeCost` on the planet the
 *   session is on, answered by `TechNodeUnlocked` and the wallet's `MoneyChanged`. A refusal
 *   changes nothing and is answered as `TechNodeRefused {nodeId, reason}`, the first of the
 *   `unlockRules` order, like the loadout's `EquipRefused`.
 * - `debug.tech-tree.unlockThrough {planetIndex}`: grants, free, every node whose tier is at most
 *   `planetIndex` (the debug "jump to depth N"; "unlock all" passes the deepest authored tier).
 *   Prerequisites never sit deeper than their nodes, so the grant leaves no hole.
 */
import type { AuthorityState } from '../../../systems/authority/authorityState'
import { withWallet } from '../../../systems/authority/authorityState'
import type { RuleEffect } from '../../../systems/authority/commandRule'
import { sub, toCanonical } from '../../../systems/money'
import type { SliceCommandRules } from '../../../systems/registries/commandRules'
import { nodeCost } from './nodeCost'
import { registeredTechTree, treeNodeOf, treeNodesThrough } from './techTree'
import type { TechNodeKind, TechNodeLane, TreeNode } from './techNode'
import { withNodesUnlocked } from './techTreeSection'
import { unlockRefusalOf, type TechNodeRefusal } from './unlockRules'

declare module '../../../systems/authority/authorityCommand' {
  interface CommandPayloads {
    'tech-tree.unlock_node': { nodeId: string }
    'debug.tech-tree.unlockThrough': { planetIndex: number }
  }
}

declare module '../../../systems/authority/domainEvent' {
  interface DomainEventBodies {
    'tech-tree.TechNodeUnlocked': {
      nodeId: string
      lane: TechNodeLane
      kind: TechNodeKind
      /** The Mark or grade of the item it unlocks: 1 for a capability. */
      mark: number
      /** Canonical Money. */
      cost: string
    }
    'tech-tree.TechNodeRefused': { nodeId: string; reason: TechNodeRefusal }
    /** The debug grant: every node through the planet is researched now, `nodeCount` of them. */
    'tech-tree.TechNodesGranted': { throughPlanet: number; nodeCount: number }
  }
}

export const UNLOCK_NODE_COMMAND = 'tech-tree.unlock_node'

export const TECH_TREE_RULES: SliceCommandRules = {
  'tech-tree.unlock_node': {
    fields: { nodeId: 'text' },
    apply: (state, { playerId, payload }) => answerUnlock(state, playerId, payload.nodeId),
  },
  'debug.tech-tree.unlockThrough': {
    fields: { planetIndex: 'wholeNumber' },
    apply: (state, { playerId, payload }) =>
      grantNodesThrough(state, playerId, payload.planetIndex),
  },
}

function answerUnlock(state: AuthorityState, playerId: string, nodeId: string): RuleEffect {
  const tree = registeredTechTree()
  const node = treeNodeOf(tree, nodeId)
  const reason = unlockRefusalOf(state, playerId, nodeId, tree)
  if (node === null || reason !== null) return refuseUnlock(state, nodeId, reason ?? 'unknown_node')
  return researchNode(state, playerId, node)
}

function refuseUnlock(state: AuthorityState, nodeId: string, reason: TechNodeRefusal): RuleEffect {
  return { state, events: [{ type: 'tech-tree.TechNodeRefused', nodeId, reason }] }
}

function researchNode(state: AuthorityState, playerId: string, node: TreeNode): RuleEffect {
  const cost = nodeCost(node, state.planet.index)
  const wallet = state.players[playerId].wallet
  const paid = withWallet(state, playerId, sub(wallet, cost))
  return {
    state: withNodesUnlocked(paid, playerId, [node.id]),
    events: [
      {
        type: 'tech-tree.TechNodeUnlocked',
        nodeId: node.id,
        lane: node.lane,
        kind: node.kind,
        mark: node.unlocks.mark,
        cost: toCanonical(cost),
      },
      { type: 'MoneyChanged', from: toCanonical(wallet), to: toCanonical(sub(wallet, cost)) },
    ],
  }
}

function grantNodesThrough(
  state: AuthorityState,
  playerId: string,
  planetIndex: number,
): RuleEffect {
  const nodeIds = treeNodesThrough(registeredTechTree(), planetIndex).map((node) => node.id)
  const granted = { throughPlanet: planetIndex, nodeCount: nodeIds.length }
  return {
    state: withNodesUnlocked(state, playerId, nodeIds),
    events: [{ type: 'tech-tree.TechNodesGranted', ...granted }],
  }
}
