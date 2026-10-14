/**
 * The spend guard's families (GD ruling Q3 (a) on #212, TD lock "K-sf", ticket 370): each family of
 * purchases registers itself from its own slice, keyed to the schedule row that admits it, so the
 * tech-tree's #212 report reads every family here and never imports a slice. A family counts spend
 * only while its anchor row is owned or `FeatureUnlocked`; the caller answers that once, here, at
 * report time, and `isMember` never re-checks it. A held or unbuilt anchor counts zero and prints
 * no row. The rows are report-only; a family may also carry a share pin, a per-planet cap on part
 * of its spend that the #212 lane gates beside the tree total (ticket 371). Nothing here fails a
 * run, and it reads `ShopSpend` records, never authority state, so there is no command, event,
 * save section or protocol bump.
 */
import type { ShopSpend } from '../bot/shopSpend'
import { add, ZERO_MONEY, type Money } from '../money'
import { LOCKED_SCHEDULE } from '../unlocks/unlockSchedule'
import { defineRegistry, entriesOf } from './seal'

export interface SpendFamily {
  /** `<slice>.<family>`, or `kernel.<family>` for the kernel's own. */
  id: string
  /** The `docs/scaling/horizontal/stats.json` row whose ownership or unlock admits the family. */
  anchorRowId: string
  isMember(spend: ShopSpend): boolean
  /** A cap on the share of a planet's spend the pinned buys may take, judged by the #212 lane. */
  sharePin?: SpendSharePin
}

/**
 * The gun-track pin's shape (Vertical Scaler on #322, GD ruling on #371): on each planet, the
 * median over the seeds of the pinned buys' share of everything bought there stays at or below
 * `maxShare`. `isPinned` picks the buys the pin counts, a subset of the family's members.
 */
export interface SpendSharePin {
  maxShare: Money
  isPinned(spend: ShopSpend): boolean
}

/** One family's spend on one planet. Report-only: only the tree total is gated (GD Q4 on #212). */
export interface FamilySpendRow {
  planetIndex: number
  familyId: string
  spend: Money
}

export const SPEND_FAMILY_REGISTRY = defineRegistry<SpendFamily>('spendFamilies')

/**
 * The kernel's gun mount at the Upgrade bay (`buyGun`), anchored to its `auto_guns` row. The bot's
 * only `buyGun` is the mount (`botShopping.ts`). A one-time feature unlock, so it is filed here and
 * counts once in the gated tree total, never in the `armoury` row or its gun-track pin (GD ruling
 * on #371).
 */
export const BUY_GUN_SPEND_FAMILY: SpendFamily = {
  id: 'kernel.buy_gun',
  anchorRowId: 'auto_guns',
  isMember: (spend) => spend.source === 'kernel' && spend.purchaseId === 'buyGun',
}

const KERNEL_SPEND_FAMILIES: readonly SpendFamily[] = [BUY_GUN_SPEND_FAMILY]

/**
 * One row per planet per family with live spend, by planet then family id. A spend matching
 * several families counts once, under the first by sorted id, so the rows never count a buy twice.
 */
export function familySpendRowsOf(
  spends: readonly ShopSpend[],
  isAnchorLive: (rowId: string) => boolean,
): FamilySpendRow[] {
  const claims = claimsOf(spends, spendFamiliesOf())
  const liveClaims = claims.filter((claim) => isAnchorLive(claim.family.anchorRowId))
  return planetsOf(liveClaims.map((claim) => claim.spend)).flatMap((planetIndex) =>
    rowsOnPlanet(planetIndex, liveClaims),
  )
}

/** The kernel's families and every registered one, sorted by id. */
export function spendFamiliesOf(): readonly SpendFamily[] {
  return [...KERNEL_SPEND_FAMILIES, ...entriesOf(SPEND_FAMILY_REGISTRY)].sort(compareIds)
}

/**
 * Why an anchored entry (a spend family, an income rate) cannot register, or null: its anchor must
 * be a row of the locked schedule.
 */
export function anchorRowProblemOf(entry: Pick<SpendFamily, 'anchorRowId'>): string | null {
  const isScheduleRow = LOCKED_SCHEDULE.rows.some((row) => row.id === entry.anchorRowId)
  if (isScheduleRow) return null
  return `its anchor row "${entry.anchorRowId}" is no row of docs/scaling/horizontal/stats.json`
}

interface FamilyClaim {
  spend: ShopSpend
  family: SpendFamily
}

/** Each spend under the first family by sorted id that claims it, live or not; unclaimed drop. */
function claimsOf(spends: readonly ShopSpend[], families: readonly SpendFamily[]): FamilyClaim[] {
  return spends.flatMap((spend) => {
    const family = families.find((candidate) => candidate.isMember(spend))
    return family === undefined ? [] : [{ spend, family }]
  })
}

function rowsOnPlanet(planetIndex: number, claims: readonly FamilyClaim[]): FamilySpendRow[] {
  const onPlanet = claims.filter((claim) => claim.spend.planetIndex === planetIndex)
  return familiesOf(onPlanet).map((family) => ({
    planetIndex,
    familyId: family.id,
    spend: familySpendOf(family, onPlanet),
  }))
}

/** The families the claims name, in sorted id order. */
function familiesOf(claims: readonly FamilyClaim[]): SpendFamily[] {
  return [...new Set(claims.map((claim) => claim.family))].sort(compareIds)
}

function familySpendOf(family: SpendFamily, claims: readonly FamilyClaim[]): Money {
  return claims
    .filter((claim) => claim.family === family)
    .map((claim) => claim.spend.cost)
    .reduce(add, ZERO_MONEY)
}

function planetsOf(spends: readonly ShopSpend[]): number[] {
  return [...new Set(spends.map((spend) => spend.planetIndex))].sort((a, b) => a - b)
}

/** Code-unit order, as the registries sort, so every machine reports in the same order. */
function compareIds(a: SpendFamily, b: SpendFamily): number {
  if (a.id === b.id) return 0
  return a.id < b.id ? -1 : 1
}
