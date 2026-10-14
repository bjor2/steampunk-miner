/**
 * The #212 spend guard (spec #161 section 3 "Definitions" and acceptance 6, the GD steer as #212
 * restates it): per planet, the tree's share of what the pacing bot spent, judged on the median
 * of the pacing seeds against the band of that planet (`tech.spendGuard`).
 *
 * - Numerator: node research (capabilities, slots, combos and Marks) and the tree-unlocked items
 *   bought, the tree's two bot purchases (`tech-tree.research`, `tech-tree.buy-item`), and the
 *   kernel turret mount (`buyGun`, the `kernel.buy_gun` family): the armoury's share counts inside
 *   the tree's (#310 Systems point 2), and the mount, a one-time unlock, counts here once (TD, GD
 *   accepted 14 Oct; GD ruling on #371). The bot buys no bore gun level (#347), so no other weapon
 *   brass reaches here.
 * - Denominator: everything the bot bought on the planet. The spend records hold no travel, so
 *   travel never counts; a restock (charges, consumables) is a purchase but not tree spend, so it
 *   counts in the denominator only (Vertical on the #157 gap review).
 *
 * A seed counts on a planet when it bought anything there.
 */
import type { ShopSpend } from '../../../systems/bot/shopSpend'
import { formatPercent } from '../../../systems/displayAmount'
import { add, cmp, div, fromSafeInteger, ZERO_MONEY, type Money } from '../../../systems/money'
import { BUY_GUN_SPEND_FAMILY } from '../../../systems/registries/spendFamilies'
import { ITEM_BOT_PURCHASE } from './itemShop'
import { RESEARCH_BOT_PURCHASE } from './researchBotPurchase'
import { TREE_ECONOMY, type SpendGuardBand } from './treeEconomy'

const TREE_PURCHASE_IDS: readonly string[] = [RESEARCH_BOT_PURCHASE.id, ITEM_BOT_PURCHASE.id]
const TWO = fromSafeInteger(2)

export interface TreeSpendRow {
  planetIndex: number
  treeSpend: Money
  totalSpend: Money
  /** `treeSpend / totalSpend`. */
  treeShare: Money
}

export interface TreeShareVerdict {
  planetIndex: number
  /** The share of each seed that bought anything on the planet, in seed order. */
  seedShares: readonly Money[]
  medianShare: Money
  /** The band the planet is judged against; null before the first band. */
  band: SpendGuardBand | null
  isOutsideBand: boolean
}

/** One row per planet with any spend, ascending. */
export function treeSpendRowsOf(spends: readonly ShopSpend[]): TreeSpendRow[] {
  return planetsOf(spends).map((planetIndex) =>
    treeSpendRowOf(
      planetIndex,
      spends.filter((spend) => spend.planetIndex === planetIndex),
    ),
  )
}

/** One verdict per planet any seed bought on, ascending; `seedRuns` holds each seed's spends. */
export function treeShareVerdictsOf(
  seedRuns: readonly (readonly ShopSpend[])[],
  bands: readonly SpendGuardBand[] = TREE_ECONOMY.spendGuard,
): TreeShareVerdict[] {
  const seedRows = seedRuns.map(treeSpendRowsOf)
  return planetsOf(seedRuns.flat()).map((planetIndex) =>
    verdictOf(planetIndex, sharesOn(seedRows, planetIndex), bandOf(planetIndex, bands)),
  )
}

/** The planets whose median share sits outside their band. */
export function missedPlanetsOf(verdicts: readonly TreeShareVerdict[]): TreeShareVerdict[] {
  return verdicts.filter((verdict) => verdict.isOutsideBand)
}

/** The verdicts as a Markdown table: each seed's share, the median, the band and a miss mark. */
export function treeShareTableOf(verdicts: readonly TreeShareVerdict[]): string {
  return [
    '| planet | seed shares | median | band | |',
    '|---|---|---|---|---|',
    ...verdicts.map(verdictLineOf),
  ].join('\n')
}

function treeSpendRowOf(planetIndex: number, spends: readonly ShopSpend[]): TreeSpendRow {
  const totalSpend = sumOf(spends)
  const treeSpend = sumOf(spends.filter(isTreePurchase))
  const treeShare = cmp(totalSpend, ZERO_MONEY) > 0 ? div(treeSpend, totalSpend) : ZERO_MONEY
  return { planetIndex, treeSpend, totalSpend, treeShare }
}

function isTreePurchase(spend: ShopSpend): boolean {
  return isTreeSliceBuy(spend) || BUY_GUN_SPEND_FAMILY.isMember(spend)
}

function isTreeSliceBuy(spend: ShopSpend): boolean {
  return spend.source === 'slice' && TREE_PURCHASE_IDS.includes(spend.purchaseId)
}

function sharesOn(seedRows: readonly TreeSpendRow[][], planetIndex: number): Money[] {
  return seedRows.flatMap((rows) =>
    rows.filter((row) => row.planetIndex === planetIndex).map((row) => row.treeShare),
  )
}

/** The last band whose planet is at or below this one. */
function bandOf(planetIndex: number, bands: readonly SpendGuardBand[]): SpendGuardBand | null {
  return bands.filter((band) => band.fromPlanet <= planetIndex).at(-1) ?? null
}

function verdictOf(
  planetIndex: number,
  seedShares: readonly Money[],
  band: SpendGuardBand | null,
): TreeShareVerdict {
  const medianShare = medianShareOf(seedShares)
  const isOutsideBand = band !== null && !isInside(medianShare, band)
  return { planetIndex, seedShares, medianShare, band, isOutsideBand }
}

function isInside(share: Money, band: SpendGuardBand): boolean {
  return cmp(share, band.minShare) >= 0 && cmp(share, band.maxShare) <= 0
}

/** The middle share, or the mean of the two middle ones for an even count; `shares` is not empty. */
export function medianShareOf(shares: readonly Money[]): Money {
  const sorted = [...shares].sort(cmp)
  const middle = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 1) return sorted[middle]
  return div(add(sorted[middle - 1], sorted[middle]), TWO)
}

function verdictLineOf(verdict: TreeShareVerdict): string {
  const seeds = verdict.seedShares.map(formatPercent).join(' / ')
  const mark = verdict.isOutsideBand ? 'outside the band' : ''
  return (
    `| P${verdict.planetIndex} | ${seeds} | ${formatPercent(verdict.medianShare)} | ` +
    `${bandTextOf(verdict.band)} | ${mark} |`
  )
}

function bandTextOf(band: SpendGuardBand | null): string {
  if (band === null) return 'not judged'
  return `${formatPercent(band.minShare)}–${formatPercent(band.maxShare)}`
}

function planetsOf(spends: readonly ShopSpend[]): number[] {
  return [...new Set(spends.map((spend) => spend.planetIndex))].sort((a, b) => a - b)
}

function sumOf(spends: readonly ShopSpend[]): Money {
  return spends.map((spend) => spend.cost).reduce(add, ZERO_MONEY)
}
