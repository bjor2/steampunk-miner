/**
 * What researching a node costs (spec #161 section 3, final): money, as band-5 ore units
 * `k_kind * b_lane * g^depthTerm`, worth the purchase planet's ore, with `paceScale` read once
 * on the node's unlock planet through the kernel's one helper (ticket 211). Buying later is never
 * cheaper in pace; past Mark 10 a Mark's depth stops, so its price grows only with the ore.
 */
import { bandOrePriceAt } from '../../../systems/economy/bandOreCost'
import type { BandOreCost } from '../../../systems/economy/economyDefinition'
import { fromSafeInteger, mul, powInt, type Money } from '../../../systems/money'
import type { TechCostKind, TreeNode } from './techNode'
import { TREE_ECONOMY, type TreeCosts } from './treeEconomy'

/** The charged price of `node` bought on `planetIndex`. */
export function nodeCost(node: TreeNode, planetIndex: number): Money {
  return bandOrePriceAt(nodeOreCostOf(node), planetIndex, node.unlockTier)
}

/** The node's price in its band's ore units, before the planet's ore value. */
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
  return costs.laneBias[node.lane] ?? fromSafeInteger(1)
}
