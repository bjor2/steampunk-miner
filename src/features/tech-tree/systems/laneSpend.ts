/**
 * The pacing bot's tree spend by lane (ticket 248, for the #212 spend guard's numerator): per
 * planet and lane, what researching the lane's nodes and buying its items cost, read off the
 * bot's spend records (`ShopSpend.boughtId`). An item counts in the lane of the node that unlocks
 * it; a Mark or combo in its own node's lane. Reported, never failed on.
 */
import type { ShopSpend } from '../../../systems/bot/shopSpend'
import { add, ZERO_MONEY, type Money } from '../../../systems/money'
import { ITEM_BOT_PURCHASE } from './itemShop'
import { RESEARCH_BOT_PURCHASE } from './researchBotPurchase'
import { registeredTechTree, treeNodeOf, type TechTree } from './techTree'
import type { TechNodeLane } from './techNode'

export interface LaneSpendRow {
  planetIndex: number
  lane: TechNodeLane
  nodeSpend: Money
  itemSpend: Money
}

interface LaneSpend {
  planetIndex: number
  lane: TechNodeLane
  kind: 'node' | 'item'
  cost: Money
}

/** One row per planet and lane with any tree spend, by planet then lane. */
export function laneSpendRowsOf(
  spends: readonly ShopSpend[],
  tree: TechTree = registeredTechTree(),
): LaneSpendRow[] {
  const laneSpends = spends.flatMap((spend) => laneSpendOf(spend, tree))
  return rowKeysOf(laneSpends).map((key) => rowOf(key, laneSpends))
}

function laneSpendOf(spend: ShopSpend, tree: TechTree): LaneSpend[] {
  const kind = kindOf(spend)
  if (kind === null || spend.boughtId === undefined) return []
  const lane = laneOf(spend.boughtId, kind, tree)
  return lane === null ? [] : [{ planetIndex: spend.planetIndex, lane, kind, cost: spend.cost }]
}

function kindOf(spend: ShopSpend): LaneSpend['kind'] | null {
  if (spend.source !== 'slice') return null
  if (spend.purchaseId === RESEARCH_BOT_PURCHASE.id) return 'node'
  return spend.purchaseId === ITEM_BOT_PURCHASE.id ? 'item' : null
}

function laneOf(boughtId: string, kind: LaneSpend['kind'], tree: TechTree): TechNodeLane | null {
  if (kind === 'node') return treeNodeOf(tree, boughtId)?.lane ?? null
  return tree.authored.find((node) => node.unlocks.itemId === boughtId)?.lane ?? null
}

type RowKey = Pick<LaneSpend, 'planetIndex' | 'lane'>

function rowKeysOf(laneSpends: readonly LaneSpend[]): RowKey[] {
  const keys = new Map(
    laneSpends.map(({ planetIndex, lane }) => [`${planetIndex}|${lane}`, { planetIndex, lane }]),
  )
  return [...keys.values()].sort(compareKeys)
}

function compareKeys(a: RowKey, b: RowKey): number {
  if (a.planetIndex !== b.planetIndex) return a.planetIndex - b.planetIndex
  return a.lane < b.lane ? -1 : a.lane > b.lane ? 1 : 0
}

function rowOf(key: RowKey, laneSpends: readonly LaneSpend[]): LaneSpendRow {
  const here = laneSpends.filter(
    (spend) => spend.planetIndex === key.planetIndex && spend.lane === key.lane,
  )
  return { ...key, nodeSpend: sumOf(here, 'node'), itemSpend: sumOf(here, 'item') }
}

function sumOf(spends: readonly LaneSpend[], kind: LaneSpend['kind']): Money {
  return spends
    .filter((spend) => spend.kind === kind)
    .map((spend) => spend.cost)
    .reduce(add, ZERO_MONEY)
}
