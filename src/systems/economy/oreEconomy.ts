/**
 * Ore tier, value and hardness (decision #6 sections 1 and 2). Everything hangs on one integer
 * ore tier `t = 3(p-1) + b` for planet `p` and band `b` (core material is band 6), so planet p's
 * surface is planet p-1's band 4 ore and a new planet never starts at a dead end.
 *   V(t) = v0 * rho^(t-1)        H(t) = eta^(t-1)        Hc(p) = 4 * H(t(p, 5))
 */
import { floorMilli, mul, type BigStat, type Money } from '../money'
import { compoundRatio, growGeometric } from './curveFamilies'
import { ECONOMY } from './economy'

const { ore } = ECONOMY
const FIRST_PLANET = 1
const FIRST_TIER = 1
const FIRST_BAND = 1

export function oreTier(planetIndex: number, band: number): number {
  assertPlanetAndBand(planetIndex, band)
  return ore.tiersPerPlanet * (planetIndex - FIRST_PLANET) + band
}

/** The tier of the core fragments' material; fragments are never sold (#10). */
export function coreMaterialTier(planetIndex: number): number {
  return oreTier(planetIndex, ore.coreTierBand)
}

/** `V(t)`, the unrounded value of one ore unit of tier `t`. */
export function oreValue(tier: number): Money {
  return growGeometric(ore.valueAtTier1, ore.valueRatio, tier - FIRST_TIER)
}

/** What one ore unit sells for: `floorMilli(V(t))` (#20 money rounding rule). */
export function oreSalePrice(tier: number): Money {
  return floorMilli(oreValue(tier))
}

/** `H(t)`: hardness of an ore-tier block, compared against drill tip and power (#7). */
export function oreHardness(tier: number): BigStat {
  return compoundRatio(ore.hardnessRatio, tier - FIRST_TIER)
}

/** `blockHardness` of #6 section 2: band `b` of planet `p`; core tiles use `coreHardness`. */
export function blockHardness(planetIndex: number, band: number): BigStat {
  return oreHardness(oreTier(planetIndex, band))
}

/** `Hc(p) = 4 * H(t(p, 5))`: a slow, deliberate dig on-curve (#10). */
export function coreHardness(planetIndex: number): BigStat {
  return mul(ore.coreHardnessMultiplier, blockHardness(planetIndex, ore.coreHardnessBand))
}

/** Bands 1 to 5 hold ore; band 6 names the core material (#6 section 1). */
function assertPlanetAndBand(planetIndex: number, band: number): void {
  if (!Number.isSafeInteger(planetIndex) || planetIndex < FIRST_PLANET) {
    throw new RangeError(`planetIndex must be a safe integer >= 1, got ${planetIndex}`)
  }
  if (!Number.isSafeInteger(band) || band < FIRST_BAND || band > ore.coreTierBand) {
    throw new RangeError(`band must be a whole number from 1 to ${ore.coreTierBand}, got ${band}`)
  }
}
