/**
 * The dynamite ladder's payoff guard (#143 guard 2, the GD lock and Systems on K8 #218): what a
 * charge of `minCharge` size frees from a dynamite-gated lead patch, over its price. Vertical's
 * patch model, as the GD lock writes it:
 *
 * - `mc = minChargeFor({lead, band}, p) = clamp(s(p) - 2 + lead, 1, band)`
 * - `valueFreed = min(M_b, inRadiusCount(r(mc))) * V(t(p, b) + lead)`, `M_b` the band's mean patch
 *   cells (`patchMeanCells`, #42). Kept ordinary ore is left out, so the figure is conservative.
 * - `price` is one charge of size `mc` (`chargePrice`, through `bandOrePriceAt`).
 * - `payoff = valueFreed / price`, expected at 2 or more.
 *
 * The share column is the reading of Systems and Content, for information only: #142's 15% share
 * cap of the cells in the radius, each sold at the lead tier.
 *
 * Domain: planets 7 to 40 and 50, the bands #142 gates (3 to 5), leads +1 and +2; a size above
 * the band is never a toll (guard 1 covers its kept-ore loss). A report that never fails the
 * build: #148 gates the bot's median `gate_cleared {kind: dynamite}` payoff. Nothing here reaches
 * the authority. Money stays Money (#196).
 */
import { inRadiusCount } from '../authority/charges/blastFront'
import { chargePrice, chargeRadiusMm, minChargeFor } from '../economy/chargeSizes'
import { oreSalePrice, oreTier } from '../economy/oreEconomy'
import { cmp, div, fromSafeInteger, mul, type Money } from '../money'
import { planetParamsFor, type PlanetParams } from '../world/planetParams'

/** Planets 7 to 40, then one endless planet (the GD lock on K8 #218). */
export const PAYOFF_PLANETS: readonly number[] = [...planetsFrom(7, 40), 50]
/** The bands #142 puts dynamite-gated lead cells in. */
export const PAYOFF_BANDS: readonly number[] = [3, 4, 5]
export const PAYOFF_LEADS: readonly number[] = [1, 2]
/** The payoff the GD lock expects of every row. */
export const PAYOFF_FLOOR = 2
/** #142 guard 5 `maxGatedValueShare` (15%), the mining-gates slice's number, read here as a figure. */
export const GATED_VALUE_SHARE_CAP_BP = 1500
const BASIS_POINTS = 10000
const ONE_CHARGE = 1

export interface ChargePayoff {
  planetIndex: number
  band: number
  lead: number
  /** `minCharge` for this lead cell. */
  size: number
  /** The gated patch cells inside the radius. */
  cellsFreed: number
  valueFreed: Money
  price: Money
  payoff: Money
  /** Information only: #142's 15% share cap of the radius's cells, at the lead tier. */
  sharePayoff: Money
}

/** Every planet, band and lead of the domain, on one world seed. */
export function chargePayoffsOf(worldSeed: number): ChargePayoff[] {
  return PAYOFF_PLANETS.flatMap((planetIndex) => {
    const params = planetParamsFor(worldSeed, planetIndex)
    return PAYOFF_BANDS.flatMap((band) =>
      PAYOFF_LEADS.map((lead) => chargePayoffOf(params, band, lead)),
    )
  })
}

export function chargePayoffOf(params: PlanetParams, band: number, lead: number): ChargePayoff {
  const size = minChargeFor({ lead, band }, params.planetIndex)
  const radiusCells = inRadiusCount(chargeRadiusMm(size))
  const cellsFreed = Math.min(params.patchMeanCells[band - 1], radiusCells)
  const leadValue = oreSalePrice(oreTier(params.planetIndex, band) + lead)
  const valueFreed = mul(fromSafeInteger(cellsFreed), leadValue)
  const price = chargePrice(size, ONE_CHARGE, params.planetIndex)
  const shareFreed = mul(cappedShareOf(radiusCells), leadValue)
  return {
    planetIndex: params.planetIndex,
    band,
    lead,
    size,
    cellsFreed,
    valueFreed,
    price,
    payoff: div(valueFreed, price),
    sharePayoff: div(shareFreed, price),
  }
}

export function isUnderPayoffFloor(row: ChargePayoff): boolean {
  return cmp(row.payoff, fromSafeInteger(PAYOFF_FLOOR)) < 0
}

/** The radius's cells times the 15% gated share cap, a fraction of a cell kept. */
function cappedShareOf(radiusCells: number): Money {
  const cellsBp = fromSafeInteger(radiusCells * GATED_VALUE_SHARE_CAP_BP)
  return div(cellsBp, fromSafeInteger(BASIS_POINTS))
}

function planetsFrom(first: number, last: number): number[] {
  return Array.from({ length: last - first + 1 }, (_, at) => first + at)
}
