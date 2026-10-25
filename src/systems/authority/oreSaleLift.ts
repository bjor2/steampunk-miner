/**
 * The sell kernel's one sale-lift provider (ticket 844; the TD ruling on #821, comment
 * 6388180827 as amended by 6388185794): the largest lift over a data list of sources, the kernel's
 * `assay_beacon` row first and every registered row after it (`registries/oreSaleLifts.ts`). Lifts
 * never stack, and each is an integer ratio on the bignum V(t), the unit floored to 0.001 (#681).
 *
 * At the Sell bay a sold tier splits in two:
 * - the units the premium ledger counts as mined on this planet, at most the units sold, sell at
 *   `floorMilli(V · max(premium lifts, other lifts))`: only the origin's merchant pays the premium;
 * - every other unit, and every unit sold away from its origin, at `floorMilli(V · max(1, other
 *   lifts))`.
 * A premium row answering above 5/4 is a broken row and throws (VS on #821).
 */
import { assayBeaconLiftOf, isAssayLifted } from '../economy/assayPricing'
import {
  isLiftAbove,
  liftedSalePrice,
  liftText,
  NO_LIFT,
  premiumLiftCap,
  type SaleLift,
} from '../economy/saleLift'
import { ARTEFACT_ID } from '../artefacts/artefactOptions'
import { add, fromBigInt, mul, ZERO_MONEY, type Money } from '../money'
import {
  ORE_SALE_LIFT_REGISTRY,
  type OreSaleLiftSource,
  type SaleLiftQuery,
  type SaleLiftUnits,
} from '../registries/oreSaleLifts'
import { entriesOf } from '../registries/seal'
import type { AuthorityState } from './authorityState'
import type { DomainEventBody, SoldItem } from './domainEvent'
import { corePlanetKeyOf } from './planetCoreBays'
import { premiumCountsFrom, sumOf, type PremiumLedger } from './premium/premiumLedger'
import { premiumLedgerOf } from './premium/premiumLedgerState'

/** The lift that won and the source that gave it; `source` null when no source lifts the units. */
export interface WinningLift {
  source: string | null
  lift: SaleLift
}

/** One sold tier: what it pays, and one `OreSaleLifted` per premium count sold at a lift. */
export interface TierSale {
  value: Money
  lifted: DomainEventBody[]
}

/** The kernel's own row: `assay_beacon` (#46) lifts the planet's shallow bands for its holder. */
const ASSAY_BEACON_LIFT: OreSaleLiftSource = {
  id: 'kernel.assay_beacon',
  pays: 'every',
  liftOf: ({ state, playerId, tier }) =>
    isAssayLiftedFor(state, playerId, tier) ? assayBeaconLiftOf(state.planet.index, tier) : null,
}

/** Whether `assay_beacon` lifts this tier's price for this player on this planet. */
export function isAssayLiftedFor(state: AuthorityState, playerId: string, tier: number): boolean {
  const held = state.players[playerId].artefact
  return held?.id === ARTEFACT_ID.assayBeacon && isAssayLifted(state.planet.index, tier)
}

/** The largest lift on the tier's `units`; premium units are asked of every row. */
export function oreSaleLift(query: SaleLiftQuery, units: SaleLiftUnits): WinningLift {
  return liftSourcesFor(units).reduce<WinningLift>(
    (best, source) => largerOf(best, source.id, checkedLiftOf(source, query)),
    { source: null, lift: NO_LIFT },
  )
}

/** One unit of the tier sold here, not counted as premium: the Sell bay's listed price. */
export function plainUnitPriceOf(state: AuthorityState, playerId: string, tier: number): Money {
  return liftedSalePrice(tier, oreSaleLift({ state, playerId, tier }, 'every').lift)
}

/** What selling `item` pays here, its home premium units at the premium lift. */
export function tierSaleOf(state: AuthorityState, playerId: string, item: SoldItem): TierSale {
  const query = { state, playerId, tier: item.tier }
  const home = homePremiumCountsOf(state, playerId, item.tier)
  const premiumUnits = smallerOf(sumOf(home), item.amount)
  const premium = oreSaleLift(query, 'premium')
  const plainPrice = liftedSalePrice(item.tier, oreSaleLift(query, 'every').lift)
  return {
    value: add(
      mul(liftedSalePrice(item.tier, premium.lift), fromBigInt(premiumUnits)),
      mul(plainPrice, fromBigInt(item.amount - premiumUnits)),
    ),
    lifted: saleLiftedEventsOf(item.tier, home, premium),
  }
}

/** The sale's total over its tiers, each unit at its rounded price (#20). */
export function saleValueOfItems(
  state: AuthorityState,
  playerId: string,
  items: readonly SoldItem[],
): Money {
  return items.reduce(
    (total, item) => add(total, tierSaleOf(state, playerId, item).value),
    ZERO_MONEY,
  )
}

/** Every `OreSaleLifted` of the sale, tier by tier. */
export function saleLiftedEventsOfItems(
  state: AuthorityState,
  playerId: string,
  items: readonly SoldItem[],
): DomainEventBody[] {
  return items.flatMap((item) => tierSaleOf(state, playerId, item).lifted)
}

function liftSourcesFor(units: SaleLiftUnits): OreSaleLiftSource[] {
  const sources = [ASSAY_BEACON_LIFT, ...entriesOf(ORE_SALE_LIFT_REGISTRY)]
  return units === 'premium' ? sources : sources.filter((source) => source.pays === 'every')
}

function checkedLiftOf(source: OreSaleLiftSource, query: SaleLiftQuery): SaleLift | null {
  const lift = source.liftOf(query)
  if (lift !== null && source.pays === 'premium' && isLiftAbove(lift, premiumLiftCap())) {
    throw new RangeError(`${source.id} lifts tier ${query.tier} by ${liftText(lift)}, past 5/4`)
  }
  return lift
}

function largerOf(best: WinningLift, source: string, lift: SaleLift | null): WinningLift {
  return lift !== null && isLiftAbove(lift, best.lift) ? { source, lift } : best
}

/** The tier's counts mined on the planet this sale happens on, in key order. */
function homePremiumCountsOf(state: AuthorityState, playerId: string, tier: number): PremiumLedger {
  return premiumCountsFrom(premiumLedgerOf(state, playerId), tier, corePlanetKeyOf(state.planet))
}

function saleLiftedEventsOf(
  tier: number,
  home: PremiumLedger,
  { source, lift }: WinningLift,
): DomainEventBody[] {
  if (source === null) return []
  return home.map((count) => ({
    type: 'OreSaleLifted',
    tier,
    speciesId: count.speciesId,
    units: count.units,
    source,
    lift: liftText(lift),
  }))
}

function smallerOf(a: bigint, b: bigint): bigint {
  return a < b ? a : b
}
