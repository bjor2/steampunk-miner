/**
 * The income items' rates for the 15% income-cap check (GD ruling on #212 Q1/Q2, TD lock "K-ir",
 * ticket 384): each income item registers from its own slice the ore value a minute it brings to
 * the hold at full stack, keyed to the schedule row that admits it, so the #212c check reads every
 * item here and imports no slice. The per-trip clamp `tripCapAt` lives in the extraction slice, so
 * it is a one-provider hook here and the kernel applies it per trip (Systems ruling 6167240683 on
 * #385): a row is `min(rate x tripMinutes, tripCap)`, relocated ore value reaching the hold, never
 * cells moved (Q2 (a)), beside the unclamped value the report prints.
 *
 * A rate counts only while its anchor is live; the caller answers that once, here, at report time.
 * A schedule row is live once owned or `FeatureUnlocked`. A tree item with no schedule row of its
 * own (the drain, the movers) anchors on its own exact item id and is live only once owned, never
 * through a feature lookup (#385, TD 6167250352). A held or unbuilt anchor counts zero and prints
 * no row. Each item counts once, under its first rate by sorted id (HS condition 3), as a spend
 * counts under its first family (#212). Economic only, never per planet: pure arithmetic per
 * report, never in the authority, so there is no command, event, save section or protocol bump.
 * A sibling of `spendFamilies` with the same rules; they share no code paths (one reads what the
 * bot spent, this what the items earn).
 */
import { add, cmp, mul, ZERO_MONEY, type Money } from '../money'
import { defineOneProviderRegistry, defineRegistry, entriesOf } from './seal'
import { anchorRowProblemOf } from './spendFamilies'

/** Where the check asks for a rate: one band of one planet, with the run's hold. */
export interface IncomeAt {
  planetIndex: number
  band: number
  /** The hold's size in units, as the vehicle's `cargoCapacity` reads. */
  cargoCapacity: number
  /** The drill's own ore value a minute on the same patch, for a rate that scales with it. */
  drillOrePerMinute: Money
  /** The minutes the drill takes to fill the hold on the band: one trip (ruling 6167240683). */
  tripMinutes: Money
}

export interface IncomeRate {
  /** `<slice>.<item>`. */
  id: string
  itemId: string
  /**
   * The `docs/scaling/horizontal/stats.json` row whose ownership or unlock admits the item, or the
   * item's own id when no row admits it: then the item counts once it is owned.
   */
  anchorRowId: string
  /**
   * Whether play pays the item through the extraction trip ledger, so `tripCapAt` holds it there
   * too; a slice test backs the answer. A row over the cap before the clamp that play does not hold
   * fails the check (ruling 6167240683).
   */
  isTripCappedInPlay: boolean
  /** Ore value a minute reaching the hold at the last Mark, all charges, 100% uptime. */
  valuePerMinuteAtFullStack(at: IncomeAt): Money
}

/** The per-trip clamp on income items (#162 4.5); one provider, the extraction slice. */
export interface TripCapSource {
  id: string
  tripCapAt(planetIndex: number, band: number, cargoCapacity: number): Money
}

/** How the caller's run answers an anchor: a schedule row, or the rate's own item. */
export interface IncomeAnchors {
  /** The row is owned or `FeatureUnlocked`. */
  isRowLive(rowId: string): boolean
  isItemOwned(itemId: string): boolean
}

/** One income item's trip at `IncomeAt`. Judged one item at a time (#161). */
export interface IncomeCapRow {
  rateId: string
  itemId: string
  isTripCappedInPlay: boolean
  /** A trip of the rate, before the trip cap. */
  unclampedValuePerTrip: Money
  /** The same after the trip cap. */
  valuePerTrip: Money
}

export const INCOME_RATE_REGISTRY = defineRegistry<IncomeRate>('incomeRates')

export const TRIP_CAP_SOURCE_REGISTRY = defineOneProviderRegistry<TripCapSource>('tripCapSource')

/** Why the registrar refuses the rate's anchor: neither a schedule row nor its own item. */
export function incomeAnchorProblemOf(rate: Pick<IncomeRate, 'anchorRowId' | 'itemId'>) {
  if (isSelfAnchored(rate)) return null
  return anchorRowProblemOf(rate)
}

/**
 * One row per item whose rate's anchor is live, by rate id. With no trip-cap source registered
 * the rates stand unclamped, an upper bound the check can only fail on, never pass.
 */
export function incomeCapRowsOf(at: IncomeAt, anchors: IncomeAnchors): IncomeCapRow[] {
  const tripCap = tripCapOf(at)
  return liveRatesOf(anchors).map((rate) => incomeCapRowOf(rate, at, tripCap))
}

/** Every row together, report-only: the cap judges items one at a time and never this sum. */
export function stackedIncomeOf(rows: readonly IncomeCapRow[]): Money {
  return rows.map((row) => row.valuePerTrip).reduce(add, ZERO_MONEY)
}

/** The live rates, each item under its first rate by sorted id (the registry's order). */
function liveRatesOf(anchors: IncomeAnchors): IncomeRate[] {
  const firstByItem = new Map<string, IncomeRate>()
  for (const rate of entriesOf(INCOME_RATE_REGISTRY)) {
    if (!firstByItem.has(rate.itemId)) firstByItem.set(rate.itemId, rate)
  }
  return [...firstByItem.values()].filter((rate) => isAnchorLive(rate, anchors))
}

/** A self-anchor is live from ownership alone (TD 6167250352). */
function isAnchorLive(rate: IncomeRate, anchors: IncomeAnchors): boolean {
  if (isSelfAnchored(rate)) return anchors.isItemOwned(rate.itemId)
  return anchors.isRowLive(rate.anchorRowId)
}

function isSelfAnchored(rate: Pick<IncomeRate, 'anchorRowId' | 'itemId'>): boolean {
  return rate.anchorRowId === rate.itemId
}

function incomeCapRowOf(rate: IncomeRate, at: IncomeAt, tripCap: Money | null): IncomeCapRow {
  const unclamped = mul(rate.valuePerMinuteAtFullStack(at), at.tripMinutes)
  return {
    rateId: rate.id,
    itemId: rate.itemId,
    isTripCappedInPlay: rate.isTripCappedInPlay,
    unclampedValuePerTrip: unclamped,
    valuePerTrip: clampedTo(unclamped, tripCap),
  }
}

/** The trip cap at `at`, or null with no provider registered. */
function tripCapOf(at: IncomeAt): Money | null {
  const [source] = entriesOf(TRIP_CAP_SOURCE_REGISTRY)
  return source?.tripCapAt(at.planetIndex, at.band, at.cargoCapacity) ?? null
}

function clampedTo(value: Money, cap: Money | null): Money {
  if (cap === null) return value
  return cmp(value, cap) > 0 ? cap : value
}
