/**
 * What researching a node costs (spec #161 section 3, final; price-only tree, Bjor's ruling on
 * #411): money, as band-5 ore units `k_kind * b_lane * g^depthTerm`, worth its price anchor's ore,
 * with `paceScale` read on the same planet through the kernel's one helper (ticket 211). The
 * anchor is the node's `unlockTier`, the planet it used to open on: "priced to arrive around Pn",
 * never "locked until Pn". The price reads no planet the player is on, so a node costs the same
 * on every planet and to every player; past Mark 10 a Mark's depth stops, so its price grows only
 * with its anchor's ore.
 */
import { bandOrePriceAt } from '../../../systems/economy/bandOreCost'
import type { BandOreCost } from '../../../systems/economy/economyDefinition'
import { fromSafeInteger, mul, powInt, type Money } from '../../../systems/money'
import { laneBiasKeyOf, type TechCostKind, type TreeNode } from './techNode'
import { registeredTechTree, treeNodeOf, type TechTree } from './techTree'
import { TREE_ECONOMY, type TreeCosts } from './treeEconomy'

/** The charged price of `node`, the same on every planet. */
export function nodeCost(node: TreeNode): Money {
  return bandOrePriceAt(nodeOreCostOf(node), node.unlockTier, node.unlockTier)
}

/** The price of the node with this id; null for an id no node has. */
export function nodeCostOf(nodeId: string, tree: TechTree = registeredTechTree()): Money | null {
  const node = treeNodeOf(tree, nodeId)
  return node === null ? null : nodeCost(node)
}

/** The node's price in its band's ore units, before its anchor's ore value. */
export function nodeOreCostOf(node: TreeNode, costs: TreeCosts = TREE_ECONOMY.costs): BandOreCost {
  const units = mul(kindCoefficientOf(node.costKind, costs), laneBiasOf(node, costs))
  return { band: costs.band, oreUnits: mul(units, powInt(costs.g, node.depthTerm)) }
}

function kindCoefficientOf(kind: TechCostKind, costs: TreeCosts): Money {
  const coefficients: Record<TechCostKind, Money> = {
    capability: costs.kCapability,
    slot: costs.kSlot,
    combo: costs.kCombo,
    mark: costs.kMark,
  }
  return coefficients[kind]
}

function laneBiasOf(node: TreeNode, costs: TreeCosts): Money {
  return costs.laneBias[laneBiasKeyOf(node.lane)] ?? fromSafeInteger(1)
}
