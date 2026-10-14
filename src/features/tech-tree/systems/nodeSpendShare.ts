/**
 * The nodes-only spend share per planet (#165, the Vertical Scaler's diagnostic on the GD split):
 * what the pacing bot spent researching nodes against everything it bought at the Upgrade bay,
 * travel excluded (#161 section 3). Reported, never failed on: a planet from P2 to P20 above the
 * watched share says to pull `kCapability` / `kCombo` before the #212 spend guard.
 *
 * Beside it, each of the six lanes' share of a planet's spend on the seed median (ticket 266, the
 * sixth lane's row in the #212 guard): its nodes, Marks and items, as `laneSpend.ts` files them.
 * Report-only, like the family rows: there are no per-lane bands, only the tree total is gated
 * (GD ruling Q4 on #212), so the sixth row takes its share from the tree's total, never a stretched
 * band.
 */
import type { ShopSpend } from '../../../systems/bot/shopSpend'
import { formatAmount, formatPercent } from '../../../systems/displayAmount'
import {
  add,
  cmp,
  div,
  fromSafeInteger,
  mul,
  roundToWhole,
  ZERO_MONEY,
  type Money,
} from '../../../systems/money'
import { laneSpendRowsOf, type LaneSpendRow } from './laneSpend'
import { RESEARCH_BOT_PURCHASE } from './researchBotPurchase'
import { TECH_LANES, type TechLane } from './techNode'
import { registeredTechTree, type TechTree } from './techTree'
import { TREE_ECONOMY, type NodeShareWatch } from './treeEconomy'
import { medianShareOf, treeSpendRowsOf, type TreeSpendRow } from './treeSpendGuard'

export interface NodeSpendRow {
  planetIndex: number
  nodeSpend: Money
  totalSpend: Money
  /** `nodeSpend / totalSpend`; zero on a planet where nothing was bought. */
  nodeShare: Money
  /** Inside the watched planets and above the watched share. */
  isOverWatch: boolean
}

/** One row per planet with any spend, ascending. */
export function nodeSpendRowsOf(
  spends: readonly ShopSpend[],
  watch: NodeShareWatch = TREE_ECONOMY.nodeShareWatch,
): NodeSpendRow[] {
  const planets = [...new Set(spends.map((spend) => spend.planetIndex))].sort((a, b) => a - b)
  return planets.map((planetIndex) =>
    rowOf(
      planetIndex,
      spends.filter((spend) => spend.planetIndex === planetIndex),
      watch,
    ),
  )
}

/** The rows as a Markdown table, the share in whole percent, flagged rows marked. */
export function nodeSpendTableOf(rows: readonly NodeSpendRow[]): string {
  return [
    '| planet | node spend | total spend | nodes share | |',
    '|---|---|---|---|---|',
    ...rows.map(
      (row) =>
        `| P${row.planetIndex} | ${formatAmount(row.nodeSpend)} | ${formatAmount(row.totalSpend)} | ` +
        `${percentOf(row.nodeShare)}% | ${row.isOverWatch ? 'above the watch' : ''} |`,
    ),
  ].join('\n')
}

/** One lane's share of a planet's spend: each seed that bought there, and their median. */
export interface LaneShareRow {
  planetIndex: number
  lane: TechLane
  /** In seed order, over the seeds that bought anything on the planet. */
  seedShares: readonly Money[]
  medianShare: Money
}

/** What one seed's run spent: per planet in all, and per planet and lane on the tree. */
interface LaneLedger {
  totals: readonly TreeSpendRow[]
  lanes: readonly LaneSpendRow[]
}

/**
 * On every planet any seed bought on, one row for each of the six lanes in screen order, at zero
 * where the lane took nothing.
 */
export function laneShareRowsOf(
  seedRuns: readonly (readonly ShopSpend[])[],
  tree: TechTree = registeredTechTree(),
): LaneShareRow[] {
  const ledgers = seedRuns.map((spends) => laneLedgerOf(spends, tree))
  return planetsBoughtOnOf(ledgers).flatMap((planetIndex) =>
    TECH_LANES.map((lane) => laneShareRowOf(planetIndex, lane, ledgers)),
  )
}

/** The lane rows as a Markdown table, each seed's share beside the median. */
export function laneShareTableOf(rows: readonly LaneShareRow[]): string {
  return [
    '| planet | lane | seed shares | median |',
    '|---|---|---|---|',
    ...rows.map(laneShareLineOf),
  ].join('\n')
}

function laneLedgerOf(spends: readonly ShopSpend[], tree: TechTree): LaneLedger {
  return { totals: treeSpendRowsOf(spends), lanes: laneSpendRowsOf(spends, tree) }
}

function planetsBoughtOnOf(ledgers: readonly LaneLedger[]): number[] {
  const planets = ledgers.flatMap((ledger) => ledger.totals.filter(isPaidFor))
  return [...new Set(planets.map((row) => row.planetIndex))].sort((a, b) => a - b)
}

function laneShareRowOf(
  planetIndex: number,
  lane: TechLane,
  ledgers: readonly LaneLedger[],
): LaneShareRow {
  const seedShares = ledgers.flatMap((ledger) => seedLaneShareOf(ledger, planetIndex, lane))
  return { planetIndex, lane, seedShares, medianShare: medianShareOf(seedShares) }
}

/** The lane's share of the seed's planet spend; none when the seed bought nothing there. */
function seedLaneShareOf(ledger: LaneLedger, planetIndex: number, lane: TechLane): Money[] {
  const total = ledger.totals.find((row) => row.planetIndex === planetIndex)
  if (total === undefined || !isPaidFor(total)) return []
  return [div(laneSpendOn(ledger, planetIndex, lane), total.totalSpend)]
}

function laneSpendOn(ledger: LaneLedger, planetIndex: number, lane: TechLane): Money {
  const row = ledger.lanes.find((each) => each.planetIndex === planetIndex && each.lane === lane)
  return row === undefined ? ZERO_MONEY : add(row.nodeSpend, row.itemSpend)
}

function isPaidFor(row: TreeSpendRow): boolean {
  return cmp(row.totalSpend, ZERO_MONEY) > 0
}

function laneShareLineOf(row: LaneShareRow): string {
  const seeds = row.seedShares.map(formatPercent).join(' / ')
  return `| P${row.planetIndex} | ${row.lane} | ${seeds} | ${formatPercent(row.medianShare)} |`
}

function rowOf(planetIndex: number, spends: readonly ShopSpend[], watch: NodeShareWatch) {
  const totalSpend = sumOf(spends)
  const nodeSpend = sumOf(spends.filter(isNodeResearch))
  const nodeShare = cmp(totalSpend, ZERO_MONEY) > 0 ? div(nodeSpend, totalSpend) : ZERO_MONEY
  return {
    planetIndex,
    nodeSpend,
    totalSpend,
    nodeShare,
    isOverWatch: isOverWatch(planetIndex, nodeShare, watch),
  }
}

function isNodeResearch(spend: ShopSpend): boolean {
  return spend.source === 'slice' && spend.purchaseId === RESEARCH_BOT_PURCHASE.id
}

function isOverWatch(planetIndex: number, share: Money, watch: NodeShareWatch): boolean {
  const isWatched = planetIndex >= watch.firstPlanet && planetIndex <= watch.lastPlanet
  return isWatched && cmp(share, watch.share) > 0
}

function sumOf(spends: readonly ShopSpend[]): Money {
  return spends.map((spend) => spend.cost).reduce(add, ZERO_MONEY)
}

function percentOf(share: Money): string {
  return formatAmount(roundToWhole(mul(share, fromSafeInteger(100))))
}
