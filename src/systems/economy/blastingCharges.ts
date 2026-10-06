/**
 * `blasting_charges` as numbers (spec #109, Systems & Economy numbers):
 *   fuse          120 ticks from plant to blast
 *   radius        tiles whose centre lies within 2.5 tiles of the charge tile's centre (21 tiles)
 *   ore yield     floor(n * 0.4 + d) of the n ore units of one tier a blast breaks reach the hold,
 *                 d in [0, 1) drawn from the blast tile, so the hold gets 40% of the ore on average
 *   self hit      26 * 1.12^T, T the enemy tier at the blast tile (1.5 crawler hits, no arc)
 *   enemy damage  2 * health(kind, T) for an enemy in the radius: it kills anything native there
 *   hardness cap  a tile breaks only if no harder than the band-5 rock of the planet; never core
 *   charge price  ceilMilli(count * 2 * V(t(p, 5)) * paceScale(p)) for `count` charges
 *   rack slot     ceilMilli([6, 8, 10, 12, 14][s] * V(t(p, 5)) * paceScale(p)) from slot s to s + 1
 * The prices are the `bandOre` family of the travel fee, the refinery slots (#105) and the gun mount
 * (#107): ore units of band 5 at the planet they are paid on. The rack holds 3 charges and each
 * slot adds one, up to 8.
 */
import { MM_PER_METRE } from '../../constants/physics'
import {
  add,
  ceil,
  ceilMilli,
  cmp,
  floor,
  fromSafeInteger,
  mul,
  toSafeInteger,
  type BigStat,
  type Money,
} from '../money'
import { growGeometric } from './curveFamilies'
import { ECONOMY } from './economy'
import type { BandOreCost, EnemyKind } from './economyDefinition'
import { enemyHealth, enemyTier } from './enemyStats'
import { blockHardness, oreTier, oreValue } from './oreEconomy'
import { paceScale } from './planetEconomy'

const { blastingCharges: charges } = ECONOMY
const RADIUS_MM = mul(charges.blastRadiusTiles, fromSafeInteger(MM_PER_METRE))
const RADIUS_MM_SQ = mul(RADIUS_MM, RADIUS_MM)

export function chargeFuseTicks(): number {
  return charges.fuseTicks
}

/** Whether a point `dxMm, dyMm` from the charge tile's centre is inside the blast. */
export function isInBlastRadius(dxMm: number, dyMm: number): boolean {
  return cmp(fromSafeInteger(dxMm * dxMm + dyMm * dyMm), RADIUS_MM_SQ) <= 0
}

/** The blast's radius in whole millimetres, rounded out. */
export function blastRadiusMm(): number {
  return toSafeInteger(ceil(RADIUS_MM))
}

/** The blast's reach in whole tiles round the charge tile, for the tiles worth testing. */
export function blastReachTiles(): number {
  return toSafeInteger(floor(charges.blastRadiusTiles))
}

export function chargeWarnTiles(): number {
  return charges.warnTiles
}

/** Charges a rack with `slotLevel` bought slots holds. */
export function rackCapacity(slotLevel: number): number {
  return charges.rackStart + slotLevel
}

export function rackMaxSlotLevel(): number {
  return charges.rackSlotCost.oreUnitsByLevel.length
}

/** Restocking `count` charges on planet `planetIndex`. */
export function restockPrice(count: number, planetIndex: number): Money {
  return ceilMilli(mul(fromSafeInteger(count), unroundedPrice(charges.chargeCost, planetIndex)))
}

/** Raising the rack from `slotLevel` (0 to 4) bought slots to the next on planet `planetIndex`. */
export function rackSlotPrice(slotLevel: number, planetIndex: number): Money {
  const oreUnits = charges.rackSlotCost.oreUnitsByLevel[slotLevel]
  if (oreUnits === undefined) throw new RangeError(`the rack has no slot after ${slotLevel}`)
  return ceilMilli(unroundedPrice({ band: charges.rackSlotCost.band, oreUnits }, planetIndex))
}

/** What a blast takes off the planter's vehicle in its radius, at the blast tile's band. */
export function blastSelfHit(planetIndex: number, band: number): BigStat {
  return growGeometric(charges.selfHit, ECONOMY.enemies.growth, enemyTier(planetIndex, band))
}

/** What a blast takes off an enemy of `kind` in its radius, at the blast tile's band. */
export function blastEnemyDamage(kind: EnemyKind, planetIndex: number, band: number): BigStat {
  const health = enemyHealth(kind, enemyTier(planetIndex, band))
  return mul(charges.enemyDamageHealthMultiple, health)
}

/** The hardest tile a blast breaks on planet `planetIndex`. */
export function blastHardnessCap(planetIndex: number): BigStat {
  return blockHardness(planetIndex, charges.hardnessCapBand)
}

/** Of `units` ore units of one tier a blast broke, how many reach the hold, `dither` in [0, 1). */
export function keptBlastOreUnits(units: number, dither: Money): number {
  const share = mul(fromSafeInteger(units), charges.oreYieldFraction)
  return toSafeInteger(floor(add(share, dither)))
}

export function botBlastThresholdTicks(): number {
  return charges.botBlastThresholdTicks
}

function unroundedPrice({ band, oreUnits }: BandOreCost, planetIndex: number): Money {
  const cargoValue = mul(oreUnits, oreValue(oreTier(planetIndex, band)))
  return mul(cargoValue, paceScale(planetIndex))
}
