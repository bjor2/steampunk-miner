/**
 * The nodes-only spend share per planet (#165, the Vertical Scaler's diagnostic on the GD split):
 * what the pacing bot spent researching nodes against everything it bought at the Upgrade bay,
 * travel excluded (#161 section 3). Reported, never failed on: a planet from P2 to P20 above the
 * watched share says to pull `kCapability` / `kCombo` before the #212 spend guard.
 */
import type { ShopSpend } from '../../../systems/bot/shopSpend'
import { formatAmount } from '../../../systems/displayAmount'
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
import { RESEARCH_BOT_PURCHASE } from './researchBotPurchase'
import { TREE_ECONOMY, type NodeShareWatch } from './treeEconomy'

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
