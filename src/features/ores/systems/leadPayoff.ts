/**
 * What a rarity lead pays and costs against its band (#140 Numbers, acceptance 4 and 5), read off
 * the kernel's value and hardness curves so no second curve lives here: a lead of `k` sells at
 * `V(t_b + k) / V(t_b)` and drills `H(t_b + k) / H(t_b)` times slower on an on-curve tip. Exact
 * `Money` ratios, for the report rows to print.
 */
import { oreHardness, oreTier, oreValue } from '../../../systems/economy/oreEconomy'
import { add, div, fromSafeInteger, mul, type BigStat, type Money } from '../../../systems/money'
import { leadWeights } from './oreCatalogue'

const BASIS_POINTS = 10000

/** How many tiers an ore of `tier` mined in band `band` of planet `planetIndex` sits above it. */
export function leadOfTier(planetIndex: number, band: number, tier: number): number {
  return tier - oreTier(planetIndex, band)
}

/** `V(t_b + lead) / V(t_b)`. */
export function valueRatioOfLead(planetIndex: number, band: number, lead: number): Money {
  const tier = oreTier(planetIndex, band)
  return div(oreValue(tier + lead), oreValue(tier))
}

/** `H(t_b + lead) / H(t_b)`: the drill ticks a lead cell costs over a common one at full eff. */
export function hardnessRatioOfLead(planetIndex: number, band: number, lead: number): BigStat {
  const tier = oreTier(planetIndex, band)
  return div(oreHardness(tier + lead), oreHardness(tier))
}

/** #140's expected value per unit over `V(t_b)`: each lead's share times its value ratio. */
export function expectedValueRatio(planetIndex: number, band: number): Money {
  const { plus1Bp, plus2Bp } = leadWeights(band)
  const shares = [BASIS_POINTS - plus1Bp - plus2Bp, plus1Bp, plus2Bp]
  const weighted = shares.map((shareBp, lead) =>
    mul(fromSafeInteger(shareBp), valueRatioOfLead(planetIndex, band, lead)),
  )
  return div(weighted.reduce(add), fromSafeInteger(BASIS_POINTS))
}
