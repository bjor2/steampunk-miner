/**
 * The #212 report's family rows (GD ruling Q3 (a) and Q4 on #212, TD lock "K-sf"): per planet, each
 * spend family's share of what the pacing bot bought there, read from the kernel `spendFamilies`
 * registry so the tech tree imports no slice. A family counts only while its anchor row is live on
 * that seed's run. Report-only: only the tree total is gated, and `kernel.buy_gun` prints here
 * until #371 moves it into the gated numerator (GD ruling Q2).
 */
import type { ShopSpend } from '../../../systems/bot/shopSpend'
import { cmp, div, ZERO_MONEY, type Money } from '../../../systems/money'
import { formatPercent } from '../../../systems/displayAmount'
import { familySpendRowsOf, type FamilySpendRow } from '../../../systems/registries/spendFamilies'
import { medianShareOf, treeSpendRowsOf, type TreeSpendRow } from './treeSpendGuard'

/** What the family rows read of one seed's run. */
export interface SeedSpends {
  shopSpend: readonly ShopSpend[]
  isAnchorLive: (rowId: string) => boolean
}

export interface FamilyShareRow {
  planetIndex: number
  familyId: string
  /** The family's share of each seed that bought anything on the planet, in seed order. */
  seedShares: readonly Money[]
  medianShare: Money
}

interface SeedLedger {
  totals: readonly TreeSpendRow[]
  families: readonly FamilySpendRow[]
}

/** One row per planet per family any seed spent on, by planet then family id. */
export function familyShareRowsOf(seeds: readonly SeedSpends[]): FamilyShareRow[] {
  const ledgers = seeds.map(ledgerOf)
  return familyKeysOf(ledgers).map(({ planetIndex, familyId }) =>
    familyShareRowOf(planetIndex, familyId, ledgers),
  )
}

/** The rows as a Markdown table, each seed's share beside the median. */
export function familyShareTableOf(rows: readonly FamilyShareRow[]): string {
  return [
    '| planet | family | seed shares | median |',
    '|---|---|---|---|',
    ...rows.map(familyShareLineOf),
  ].join('\n')
}

function ledgerOf(seed: SeedSpends): SeedLedger {
  return {
    totals: treeSpendRowsOf(seed.shopSpend),
    families: familySpendRowsOf(seed.shopSpend, seed.isAnchorLive),
  }
}

/** Each planet and family any seed has a row for, by planet then family id. */
function familyKeysOf(ledgers: readonly SeedLedger[]): { planetIndex: number; familyId: string }[] {
  const keys = new Map<string, { planetIndex: number; familyId: string }>()
  for (const row of ledgers.flatMap((ledger) => ledger.families)) {
    keys.set(`${row.planetIndex} ${row.familyId}`, row)
  }
  return [...keys.values()].sort(compareKeys)
}

function familyShareRowOf(
  planetIndex: number,
  familyId: string,
  ledgers: readonly SeedLedger[],
): FamilyShareRow {
  const seedShares = ledgers.flatMap((ledger) => seedShareOf(ledger, planetIndex, familyId))
  return { planetIndex, familyId, seedShares, medianShare: medianShareOf(seedShares) }
}

/** The family's share of the seed's planet spend; none when the seed bought nothing there. */
function seedShareOf(ledger: SeedLedger, planetIndex: number, familyId: string): Money[] {
  const total = ledger.totals.find((row) => row.planetIndex === planetIndex)?.totalSpend
  if (total === undefined || cmp(total, ZERO_MONEY) <= 0) return []
  return [div(familySpendOn(ledger, planetIndex, familyId), total)]
}

function familySpendOn(ledger: SeedLedger, planetIndex: number, familyId: string): Money {
  const row = ledger.families.find(
    (each) => each.planetIndex === planetIndex && each.familyId === familyId,
  )
  return row?.spend ?? ZERO_MONEY
}

function familyShareLineOf(row: FamilyShareRow): string {
  const seeds = row.seedShares.map(formatPercent).join(' / ')
  return `| P${row.planetIndex} | ${row.familyId} | ${seeds} | ${formatPercent(row.medianShare)} |`
}

function compareKeys(
  a: { planetIndex: number; familyId: string },
  b: { planetIndex: number; familyId: string },
): number {
  if (a.planetIndex !== b.planetIndex) return a.planetIndex - b.planetIndex
  if (a.familyId === b.familyId) return 0
  return a.familyId < b.familyId ? -1 : 1
}
