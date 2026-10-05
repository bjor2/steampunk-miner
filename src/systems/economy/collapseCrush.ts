/**
 * What a collapse takes off a vehicle caught in it (decision #43 Data, S3 defaults accepted on
 * #57): `collapseCrush` is a hull fraction per band, then the core, read from `economy.json`, so
 *   crush(band) = collapseCrush[band] * hullMax
 * One crush per refill that touches the vehicle; 0.08 leaves room to dig out of a few.
 */
import { mul, type BigStat } from '../money'
import { ECONOMY } from './economy'

const { casing, ore } = ECONOMY

/** `band` is 1 to 5, or the core's band (`coreTierBand`, 6). */
export function collapseCrushFraction(band: number): BigStat {
  return casing.collapseCrush[Math.min(band, ore.coreTierBand) - 1]
}

export function collapseCrushDamage(band: number, hullMax: BigStat): BigStat {
  return mul(collapseCrushFraction(band), hullMax)
}
