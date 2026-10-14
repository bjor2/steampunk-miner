/**
 * The income items' rates for the 15% income-cap check (GD ruling on #212 Q1/Q2, TD lock "K-ir",
 * ticket 384): each income item registers from its own slice the ore value a minute it brings to
 * the hold at full stack, keyed to the schedule row that admits it, so the #212c check reads every
 * item here and imports no slice. The per-trip clamp `tripCapAt` lives in the extraction slice, so
 * it is a one-provider hook here and the kernel applies it: a row is `min(rate, tripCap)`, relocated
 * ore value reaching the hold, never cells moved (Q2 (a)).
 *
 * A rate counts only while its anchor row is owned or `FeatureUnlocked`; the caller answers that
 * once, here, at report time. A held or unbuilt anchor counts zero and prints no row. Economic
 * only, never per planet: pure arithmetic per report, never in the authority, so there is no
 * command, event, save section or protocol bump. A sibling of `spendFamilies` with the same rules;
 * they share no code paths (one reads what the bot spent, this what the items earn).
 */
import { add, cmp, ZERO_MONEY, type Money } from '../money'
import { defineOneProviderRegistry, defineRegistry, entriesOf } from './seal'

/** Where the check asks for a rate: one band of one planet, with the run's hold. */
export interface IncomeAt {
  planetIndex: number
  band: number
  /** The hold's size in units, as the vehicle's `cargoCapacity` reads. */
  cargoCapacity: number
  /** The drill's own ore value a minute on the same patch, which the cap is judged against. */
  drillOrePerMinute: Money
}

export interface IncomeRate {
  /** `<slice>.<item>`. */
  id: string
  itemId: string
  /** The `docs/scaling/horizontal/stats.json` row whose ownership or unlock admits the item. */
  anchorRowId: string
  /**
   * Ore value a minute reaching the hold at the last Mark, all charges, 100% uptime; the kernel
   * clamps it to the trip cap.
   */
  valuePerMinuteAtFullStack(at: IncomeAt): Money
}

/** The per-trip clamp on income items (#162 4.5); one provider, the extraction slice. */
export interface TripCapSource {
  id: string
  tripCapAt(planetIndex: number, band: number, cargoCapacity: number): Money
}

/** One income item's rate at `IncomeAt`, after the trip cap. Judged one item at a time (#161). */
export interface IncomeCapRow {
  rateId: string
  itemId: string
  valuePerMinute: Money
}

export const INCOME_RATE_REGISTRY = defineRegistry<IncomeRate>('incomeRates')

export const TRIP_CAP_SOURCE_REGISTRY = defineOneProviderRegistry<TripCapSource>('tripCapSource')

/**
 * One row per registered rate whose anchor row is live, by rate id. With no trip-cap source
 * registered the rates stand unclamped, an upper bound the check can only fail on, never pass.
 */
export function incomeCapRowsOf(
  at: IncomeAt,
  isAnchorLive: (rowId: string) => boolean,
): IncomeCapRow[] {
  const tripCap = tripCapOf(at)
  return liveRatesOf(isAnchorLive).map((rate) => incomeCapRowOf(rate, at, tripCap))
}

/** Every row together, report-only: the cap judges items one at a time and never this sum. */
export function stackedIncomeOf(rows: readonly IncomeCapRow[]): Money {
  return rows.map((row) => row.valuePerMinute).reduce(add, ZERO_MONEY)
}

function liveRatesOf(isAnchorLive: (rowId: string) => boolean): IncomeRate[] {
  return entriesOf(INCOME_RATE_REGISTRY).filter((rate) => isAnchorLive(rate.anchorRowId))
}

function incomeCapRowOf(rate: IncomeRate, at: IncomeAt, tripCap: Money | null): IncomeCapRow {
  const value = rate.valuePerMinuteAtFullStack(at)
  return { rateId: rate.id, itemId: rate.itemId, valuePerMinute: clampedTo(value, tripCap) }
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
