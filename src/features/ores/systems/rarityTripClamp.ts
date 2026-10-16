/**
 * The epic and mythic trip clamp (Systems on #139, comment 6202970624 section 4, at the 1500 bp of
 * comment 6203159815; ticket 445). Within one trip, a find of a clamped tier pays in full only while
 * the trip's clamped value stays at most
 *
 *   rarityTripCap = floorMilli(tripClampShareBp / 10000 * C * V(t_b))
 *
 * with `C` the hold and `b` the band of the find, the shape of #162's `tripCapAt`. A find past it
 * pays `V(t_b)`, the band's common price: every cell still pays at least a common one, and the
 * clamped tiers never hold more than 15% of a full hold of the band's ore. The answer is the tier
 * the unit is kept and sold at, so the cargo stays keyed by tier and one id keeps one price.
 */
import { oreSalePrice, oreTier, oreValue } from '../../../systems/economy/oreEconomy'
import {
  add,
  cmp,
  div,
  floorMilli,
  fromSafeInteger,
  mul,
  ZERO_MONEY,
  type Money,
} from '../../../systems/money'
import { oreTierOf } from './oreCatalogue'
import { ORE_ROWS, type OreRows } from './oreRows'
import { rarityTierOf } from './rarityTiers'

/** One trip's running value of the clamped tiers paid in full, from the last sale. */
export interface RarityTrip {
  clampedValue: Money
}

export interface RarityFind {
  planetIndex: number
  band: number
  /** The cell's tiers above its band's own. */
  tierOffset: number
  cargoCapacity: number
}

export interface PaidRarityFind {
  /** The tier the unit is kept and sold at: its own, or the band's when the clamp holds it. */
  saleTier: number
  trip: RarityTrip
}

export const NEW_RARITY_TRIP: RarityTrip = { clampedValue: ZERO_MONEY }

const BASIS_POINTS = fromSafeInteger(10000)

/** The most the clamped tiers may pay in full in one trip of band `band`. */
export function rarityTripCapAt(
  planetIndex: number,
  band: number,
  cargoCapacity: number,
  rows: OreRows = ORE_ROWS,
): Money {
  const fullHold = mul(fromSafeInteger(cargoCapacity), oreValue(oreTier(planetIndex, band)))
  const share = div(fromSafeInteger(rows.rarity.tripClampShareBp), BASIS_POINTS)
  return floorMilli(mul(share, fullHold))
}

/** What a find pays and what the trip has used after it. */
export function paidRarityFind(
  trip: RarityTrip,
  find: RarityFind,
  rows: OreRows = ORE_ROWS,
): PaidRarityFind {
  const fullTier = oreTierOf(find.planetIndex, find.band, find.tierOffset)
  if (!isTripClamped(find.tierOffset, rows)) return { saleTier: fullTier, trip }
  return paidClampedFind(trip, find, fullTier, rows)
}

/** Whether the tier at `tierOffset` counts against the trip clamp (epic and mythic). */
export function isTripClamped(tierOffset: number, rows: OreRows = ORE_ROWS): boolean {
  return rows.rarity.tripClampTierIds.includes(rarityTierOf(tierOffset, rows).id)
}

function paidClampedFind(
  trip: RarityTrip,
  find: RarityFind,
  fullTier: number,
  rows: OreRows,
): PaidRarityFind {
  const clampedValue = add(trip.clampedValue, oreSalePrice(fullTier))
  const cap = rarityTripCapAt(find.planetIndex, find.band, find.cargoCapacity, rows)
  if (cmp(clampedValue, cap) <= 0) return { saleTier: fullTier, trip: { clampedValue } }
  return { saleTier: oreTier(find.planetIndex, find.band), trip }
}
