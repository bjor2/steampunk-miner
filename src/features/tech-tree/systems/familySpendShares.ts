/**
 * The #212 report's family rows (GD ruling Q3 (a) and Q4 on #212, TD lock "K-sf"): per planet, each
 * spend family's share of what the pacing bot bought there, read from the kernel `spendFamilies`
 * registry so the tech tree imports no slice. A family counts only while its anchor row is live on
 * that seed's run. Report-only: only the tree total is gated. The weapon spend prints as the one
 * `armoury` row its slice registers, the kernel turret mount inside it (ticket 371).
 */
import type { ShopSpend } from '../../../systems/bot/shopSpend'
import { cmp, div, ZERO_MONEY, type Money } from '../../../systems/money'
import { formatPercent } from '../../../systems/displayAmount'
import {
  familySpendRowsOf,
  spendFamiliesOf,
  type FamilySpendRow,
} from '../../../systems/registries/spendFamilies'
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

interface FamilyKey {
  planetIndex: number
  familyId: string
}

interface SeedLedger {
  totals: readonly TreeSpendRow[]
  families: readonly FamilySpendRow[]
}

/**
 * One row per planet per family any seed spent on, by planet then family id. On each of
 * `reportPlanets` every family live on any seed prints too, at zero when nothing was spent on it
 * (Systems (c) on #310: the armoury row prints on P2/P10/P20/P40); a planet no seed bought on
 * prints nothing.
 */
export function familyShareRowsOf(
  seeds: readonly SeedSpends[],
  reportPlanets: readonly number[] = [],
): FamilyShareRow[] {
  const ledgers = seeds.map(ledgerOf)
  const keys = [...familyKeysOf(ledgers), ...reportKeysOf(seeds, reportPlanets)]
  return uniqueSortedKeysOf(keys)
    .filter((key) => isBoughtOnByAnySeed(ledgers, key.planetIndex))
    .map(({ planetIndex, familyId }) => familyShareRowOf(planetIndex, familyId, ledgers))
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

/** Each planet and family any seed has a row for. */
function familyKeysOf(ledgers: readonly SeedLedger[]): FamilyKey[] {
  return ledgers.flatMap((ledger) => ledger.families)
}

/** Each report planet with each family whose anchor is live on any seed. */
function reportKeysOf(seeds: readonly SeedSpends[], reportPlanets: readonly number[]): FamilyKey[] {
  const liveFamilies = spendFamiliesOf().filter((family) =>
    seeds.some((seed) => seed.isAnchorLive(family.anchorRowId)),
  )
  return reportPlanets.flatMap((planetIndex) =>
    liveFamilies.map((family) => ({ planetIndex, familyId: family.id })),
  )
}

/** The keys once each, by planet then family id. */
function uniqueSortedKeysOf(keys: readonly FamilyKey[]): FamilyKey[] {
  const unique = new Map<string, FamilyKey>()
  for (const key of keys) unique.set(`${key.planetIndex} ${key.familyId}`, key)
  return [...unique.values()].sort(compareKeys)
}

function familyShareRowOf(
  planetIndex: number,
  familyId: string,
  ledgers: readonly SeedLedger[],
): FamilyShareRow {
  const seedShares = ledgers.flatMap((ledger) => seedShareOf(ledger, planetIndex, familyId))
  return { planetIndex, familyId, seedShares, medianShare: medianShareOf(seedShares) }
}

/** Whether any seed paid for anything on the planet, so the row has a share to print. */
function isBoughtOnByAnySeed(ledgers: readonly SeedLedger[], planetIndex: number): boolean {
  return ledgers.some((ledger) => paidTotalOn(ledger, planetIndex) !== null)
}

/** The family's share of the seed's planet spend; none when the seed bought nothing there. */
function seedShareOf(ledger: SeedLedger, planetIndex: number, familyId: string): Money[] {
  const total = paidTotalOn(ledger, planetIndex)
  if (total === null) return []
  return [div(familySpendOn(ledger, planetIndex, familyId), total)]
}

/** The seed's spend on the planet, or null when it paid nothing there. */
function paidTotalOn(ledger: SeedLedger, planetIndex: number): Money | null {
  const total = ledger.totals.find((row) => row.planetIndex === planetIndex)?.totalSpend
  return total !== undefined && cmp(total, ZERO_MONEY) > 0 ? total : null
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

function compareKeys(a: FamilyKey, b: FamilyKey): number {
  if (a.planetIndex !== b.planetIndex) return a.planetIndex - b.planetIndex
  if (a.familyId === b.familyId) return 0
  return a.familyId < b.familyId ? -1 : 1
}
