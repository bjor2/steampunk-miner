/**
 * `blasting_charges` as numbers (spec #109, Systems & Economy numbers), for a charge of size `size`
 * of the dynamite ladder (`chargeSizes.ts`, K8 #218; size 1 is the shipped charge):
 *   ore yield     floor(n * k + d) of the n ore units of one tier a blast breaks reach the hold,
 *                 k the size's kept fraction (0.4 at size 1), d in [0, 1) drawn from the blast tile
 *   self hit      26 * 1.12^T * r(n) / r(1), T the enemy tier at the blast tile (1.5 crawler hits at
 *                 size 1, no arc); from size 4 the inner half of the radius wrecks the planter
 *   enemy damage  2 * health(kind, T) for an enemy in the radius: it kills anything native there
 *   hardness cap  a tile breaks only if no harder than the band-5 rock of the planet; never core
 *   rack slot     ceilMilli([6, 8, 10, 12, 14][s] * V(t(p, 5)) * paceScale(p)) from slot s to s + 1
 * The prices are the `bandOre` family of the travel fee, the refinery slots (#105) and the gun mount
 * (#107): ore units of band 5 at the planet they are paid on. The rack holds 3 slots and each
 * bought slot adds one, up to 8.
 */
import { MM_PER_METRE } from '../../constants/physics'
import { add, floor, fromSafeInteger, mul, toSafeInteger, type BigStat, type Money } from '../money'
import { growGeometric } from './curveFamilies'
import { ECONOMY } from './economy'
import { bandOrePrice } from './bandOreCost'
import { bandOreCurveOf } from './costCurveLookup'
import type { BandOreCostCurve, EnemyKind } from './economyDefinition'
import { enemyHealth, enemyTier } from './enemyStats'
import { blockHardness } from './oreEconomy'
import { keptFractionOf, selfHitScaleOf } from './chargeSizes'

const { blastingCharges: charges } = ECONOMY

export function chargeWarnTiles(): number {
  return charges.warnTiles
}

/** Whether a vehicle `dxMm, dyMm` from a planted charge's centre sees its fuse warning. */
export function isInFuseWarning(dxMm: number, dyMm: number): boolean {
  const reachMm = charges.warnTiles * MM_PER_METRE
  return dxMm * dxMm + dyMm * dyMm <= reachMm * reachMm
}

/** The slots a rack with `slotLevel` bought slots holds; a size-1 charge takes one. */
export function rackCapacity(slotLevel: number): number {
  return charges.rackStart + slotLevel
}

export function rackMaxSlotLevel(): number {
  return rackSlotCurve().oreUnitsByLevel.length
}

/** Raising the rack from `slotLevel` (0 to 4) bought slots to the next on planet `planetIndex`. */
export function rackSlotPrice(slotLevel: number, planetIndex: number): Money {
  const { band, oreUnitsByLevel } = rackSlotCurve()
  const oreUnits = oreUnitsByLevel[slotLevel]
  if (oreUnits === undefined) throw new RangeError(`the rack has no slot after ${slotLevel}`)
  return bandOrePrice({ band, oreUnits }, planetIndex)
}

/** What a blast of `size` takes off the planter's vehicle in its radius, at the tile's band. */
export function blastSelfHit(planetIndex: number, band: number, size: number): BigStat {
  const hit = growGeometric(charges.selfHit, ECONOMY.enemies.growth, enemyTier(planetIndex, band))
  return mul(hit, selfHitScaleOf(size))
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

/** Of `units` ore units of one tier a blast of `size` broke, how many reach the hold. */
export function keptBlastOreUnits(units: number, dither: Money, size: number): number {
  const share = mul(fromSafeInteger(units), keptFractionOf(size))
  return toSafeInteger(floor(add(share, dither)))
}

export function botBlastThresholdTicks(): number {
  return charges.botBlastThresholdTicks
}

function rackSlotCurve(): BandOreCostCurve {
  return bandOreCurveOf(charges.rackSlotCostCurveId)
}
