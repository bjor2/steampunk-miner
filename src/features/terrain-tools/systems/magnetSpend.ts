/**
 * The terrain magnets' one row in the #212 spend guard (GD lock on #246 "Spend", Systems on 7 Oct;
 * ticket 287): per planet, everything the pacing bot spent on the family, its members' nodes and
 * Marks and the items themselves, folded into one `terrain_magnets` row, never one row per item.
 * The members are read from their family tag (`MagnetItem.familyId`, set in #282). The beacon
 * carries no tag and keeps its spend in its own lane row. Reported, never failed on: the guard's
 * bands are #212's.
 */
import type { ShopSpend } from '../../../systems/bot/shopSpend'
import { add, ZERO_MONEY, type Money } from '../../../systems/money'
import { MAGNET_ITEMS, TERRAIN_MAGNETS_FAMILY, type MagnetItem } from './magnetItems'

export interface MagnetFamilySpendRow {
  planetIndex: number
  familyId: typeof TERRAIN_MAGNETS_FAMILY
  /** Node research, Marks and item buys of every member on the planet. */
  spend: Money
}

/** One row per planet with any spend on the family, ascending. */
export function magnetFamilySpendRowsOf(
  spends: readonly ShopSpend[],
  items: readonly MagnetItem[] = MAGNET_ITEMS,
): MagnetFamilySpendRow[] {
  const familyIds = familyBoughtIdsOf(items)
  const familySpends = spends.filter((spend) => isFamilySpend(spend, familyIds))
  return planetsOf(familySpends).map((planetIndex) => rowOf(planetIndex, familySpends))
}

/** The ids a bot spend record names for the family: each tagged member's item and node. */
function familyBoughtIdsOf(items: readonly MagnetItem[]): ReadonlySet<string> {
  const members = items.filter((item) => item.familyId === TERRAIN_MAGNETS_FAMILY)
  return new Set(members.flatMap((item) => [item.itemId, item.node.id]))
}

function isFamilySpend(spend: ShopSpend, familyIds: ReadonlySet<string>): boolean {
  return spend.source === 'slice' && spend.boughtId !== undefined && familyIds.has(spend.boughtId)
}

function planetsOf(spends: readonly ShopSpend[]): number[] {
  return [...new Set(spends.map((spend) => spend.planetIndex))].sort((a, b) => a - b)
}

function rowOf(planetIndex: number, spends: readonly ShopSpend[]): MagnetFamilySpendRow {
  const spend = spends
    .filter((each) => each.planetIndex === planetIndex)
    .map((each) => each.cost)
    .reduce(add, ZERO_MONEY)
  return { planetIndex, familyId: TERRAIN_MAGNETS_FAMILY, spend }
}
