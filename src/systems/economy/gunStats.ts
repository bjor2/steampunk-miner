/**
 * `auto_guns` as numbers (#107 numbers, Systems & Economy):
 *   shot damage   = damageFractionOfDrill * drillPower(L) * kDrillVsEnemy     (BigStat)
 *   fire interval = 30 + (12 - 30) * (x - 1) / ((x - 1) + 8)  ticks, rounded half up
 *   mount price   = ceilMilli(30 * V(t(p, 5)) * paceScale(p))
 *   level price   = ceilMilli(8 * 1.25^(g - 1) * V(t(p, 5)) * paceScale(p))  to go from g to g + 1
 * Damage follows the drill, and enemy health and drill power both grow 1.12^6 a planet, so an
 * on-curve kill takes the same number of shots on every planet; the gun track buys rate only.
 * The prices are the `bandOre` family of the travel fee and the refinery slots (#105): ore units
 * of band 5 at the planet the guns are bought on.
 *
 * Two-tier since #180 (TD on the migration rows): the gun stores a step like the tracks. The mount
 * is the first major, one buy from step 0 to step 10; major g (1..16, the cap counts majors) is
 * then bought in ten steps priced from its level price as `upgradeSteps.ts` splits a major, in the
 * 0.001 quantum. The fire interval is the saturating curve at the step's effective level x.
 */
import { TICKS_PER_SECOND } from '../../constants/physics'
import { ceilMilli, mul, type BigStat, type Money } from '../money'
import { roundHalfUpNumber } from '../wholeFractions'
import { bandOrePrice, bandOreWorth } from './bandOreCost'
import { growGeometric } from './curveFamilies'
import { ECONOMY } from './economy'
import { saturatingAtStep } from './stepStats'
import { majorOf, pipOf, stepOfMajor, stepPriceWithin } from './upgradeSteps'
import { drillPowerAtStep } from './vehicleStats'

/** The gun track's id, as its icon and the Upgrade bay name it (#107, #108). */
export const GUN_TRACK_ID = 'gun'

const { gun } = ECONOMY
const MOUNTED_LEVEL = 1

/** The step a fresh mount gives, its first major; 0 means no guns, and 1 to 9 never happen. */
export function gunMountStep(): number {
  return stepOfMajor(MOUNTED_LEVEL)
}

/** The top step: the cap of 16 counts majors. */
export function gunTopStep(): number {
  return stepOfMajor(gun.maxLevel)
}

/** What one shot takes off an enemy for a vehicle at drill power step `drillStep`. */
export function gunShotDamage(drillStep: number): BigStat {
  const shot = mul(gun.damageFractionOfDrill, drillPowerAtStep(drillStep))
  return mul(shot, ECONOMY.enemies.combat.kDrillVsEnemy)
}

/** Whole ticks between shots at gun step `gunStep` (mounted), rounded half up. */
export function gunFireIntervalTicks(gunStep: number): number {
  const range = gun.fireIntervalTicks
  return roundHalfUpNumber(saturatingAtStep(range, gun.halfLevel, gunStep, MOUNTED_LEVEL))
}

/** Shots a second at `gunStep`, for the Upgrade bay preview. */
export function gunShotsPerSecond(gunStep: number): number {
  return TICKS_PER_SECOND / gunFireIntervalTicks(gunStep)
}

export function gunRangeTiles(): number {
  return gun.rangeTiles
}

export function gunFrontDeadConeDegrees(): number {
  return gun.frontDeadConeDeg
}

/** Mounting the guns on planet `planetIndex`. */
export function gunMountPrice(planetIndex: number): Money {
  return bandOrePrice(gun.mountCost, planetIndex)
}

/** Raising the guns from major `gunLevel` (>= 1) to the next major on planet `planetIndex`. */
export function gunLevelPrice(gunLevel: number, planetIndex: number): Money {
  return ceilMilli(gunLevelWorth(gunLevel, planetIndex))
}

/** The price of the next gun buy from step `gunStep` (0: the mount, else one step). */
export function nextGunPrice(gunStep: number, planetIndex: number): Money {
  if (gunStep < gunMountStep()) return gunMountPrice(planetIndex)
  const worth = gunLevelWorth(majorOf(gunStep), planetIndex)
  return stepPriceWithin(worth, gun.levelCost.ratio, pipOf(gunStep), ceilMilli)
}

function gunLevelWorth(gunLevel: number, planetIndex: number): Money {
  const { band, oreUnits, ratio } = gun.levelCost
  const units = growGeometric(oreUnits, ratio, gunLevel - MOUNTED_LEVEL)
  return bandOreWorth({ band, oreUnits: units }, planetIndex)
}

export function gunLevelCostCurveId(): string {
  return gun.levelCost.id
}
