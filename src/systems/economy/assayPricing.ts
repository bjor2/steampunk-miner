/**
 * `assay_beacon`'s sell price (decision #46, Systems & Economy acceptance 3 on #64): at the Sell
 * bay, ore of the current planet's bands `b < 3` sells at `floorMilli(V(t(p, 3)))` per unit; band
 * 3 and deeper, and ore of any other planet, keep their own `floorMilli(V(t))`. The mid band is
 * `prices.assayBeaconBand` in economy.json. Charges keep their `ceilMilli` rounding elsewhere.
 */
import type { Money } from '../money'
import { ECONOMY } from './economy'
import { oreSalePrice, oreTier } from './oreEconomy'

const FIRST_PLANET = 1
const FIRST_BAND = 1

/** The band a tier is on planet `p` (`t = 3(p-1) + b`); outside 1..5 for another planet's ore. */
export function bandOfTierOnPlanet(planetIndex: number, tier: number): number {
  return tier - ECONOMY.ore.tiersPerPlanet * (planetIndex - FIRST_PLANET)
}

/** Whether the beacon lifts this tier's price on this planet. */
export function isAssayLifted(planetIndex: number, tier: number): boolean {
  const band = bandOfTierOnPlanet(planetIndex, tier)
  return band >= FIRST_BAND && band < ECONOMY.prices.assayBeaconBand
}

/** One unit's price with the beacon held. */
export function assayedSalePrice(planetIndex: number, tier: number): Money {
  if (!isAssayLifted(planetIndex, tier)) return oreSalePrice(tier)
  return oreSalePrice(oreTier(planetIndex, ECONOMY.prices.assayBeaconBand))
}
