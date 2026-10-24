/**
 * `assay_beacon`'s sell price (decision #46, Systems & Economy acceptance 3 on #64): at the Sell
 * bay, ore of the current planet's bands `b < 3` sells at the band-3 unit price; band 3 and
 * deeper, and ore of any other planet, keep their own `floorMilli(V(t))`. The mid band is
 * `prices.assayBeaconBand` in economy.json. Charges keep their `ceilMilli` rounding elsewhere.
 *
 * The beacon is one sale lift among the others (ticket 844, the TD ruling on #821): V(t(p, 3)) is
 * V(t) times the value ratio once per band below band 3, so band 1 reads (3/2)^2 = 9/4 and band 2
 * reads 3/2, applied on the bignum V(t) and floored to 0.001 like every lift.
 */
import { integerRatioOf, type Money } from '../money'
import { ECONOMY } from './economy'
import { liftedSalePrice, liftToPower, NO_LIFT, type SaleLift } from './saleLift'

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

/** The beacon's lift on a tier of this planet, or null where it lifts nothing. */
export function assayBeaconLiftOf(planetIndex: number, tier: number): SaleLift | null {
  if (!isAssayLifted(planetIndex, tier)) return null
  const bandsBelowMid = ECONOMY.prices.assayBeaconBand - bandOfTierOnPlanet(planetIndex, tier)
  return liftToPower(integerRatioOf(ECONOMY.ore.valueRatio), bandsBelowMid)
}

/** One unit's price with the beacon held. */
export function assayedSalePrice(planetIndex: number, tier: number): Money {
  return liftedSalePrice(tier, assayBeaconLiftOf(planetIndex, tier) ?? NO_LIFT)
}
