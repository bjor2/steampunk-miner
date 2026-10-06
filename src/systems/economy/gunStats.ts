/**
 * `auto_guns` as numbers (#107 numbers, Systems & Economy):
 *   shot damage   = damageFractionOfDrill * drillPower(L) * kDrillVsEnemy     (BigStat)
 *   fire interval = ceil(30 + (12 - 30) * (g - 1) / ((g - 1) + 8))  ticks, gun level g in 1..16
 *   mount price   = ceilMilli(30 * V(t(p, 5)) * paceScale(p))
 *   level price   = ceilMilli(8 * 1.25^(g - 1) * V(t(p, 5)) * paceScale(p))  to go from g to g + 1
 * Damage follows the drill, and enemy health and drill power both grow 1.12^6 a planet, so an
 * on-curve kill takes the same number of shots on every planet; the gun track buys rate only.
 * The prices are the `bandOre` family of the travel fee and the refinery slots (#105): ore units
 * of band 5 at the planet the guns are bought on.
 */
import { TICKS_PER_SECOND } from '../../constants/physics'
import { ceilMilli, mul, type BigStat, type Money } from '../money'
import { growGeometric, saturate } from './curveFamilies'
import { ECONOMY } from './economy'
import type { BandOreCost } from './economyDefinition'
import { oreTier, oreValue } from './oreEconomy'
import { paceScale } from './planetEconomy'
import { drillPower } from './vehicleStats'

/** The gun track's id, as its icon and the Upgrade bay name it (#107, #108). */
export const GUN_TRACK_ID = 'gun'

const { gun } = ECONOMY
const MOUNTED_LEVEL = 1

/** The level a fresh mount gives; 0 means no guns. */
export function gunMountLevel(): number {
  return MOUNTED_LEVEL
}

export function gunMaxLevel(): number {
  return gun.maxLevel
}

/** What one shot takes off an enemy for a vehicle at drill power level `drillLevel`. */
export function gunShotDamage(drillLevel: number): BigStat {
  const shot = mul(gun.damageFractionOfDrill, drillPower(drillLevel))
  return mul(shot, ECONOMY.enemies.combat.kDrillVsEnemy)
}

/** Whole ticks between shots at gun level `gunLevel` (>= 1), rounded up so no shot comes early. */
export function gunFireIntervalTicks(gunLevel: number): number {
  return Math.ceil(saturate(gun.fireIntervalTicks, gunLevel - MOUNTED_LEVEL, gun.halfLevel))
}

/** Shots a second at `gunLevel`, for the Upgrade bay preview. */
export function gunShotsPerSecond(gunLevel: number): number {
  return TICKS_PER_SECOND / gunFireIntervalTicks(gunLevel)
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

/** Raising the guns from `gunLevel` (>= 1) to the next level on planet `planetIndex`. */
export function gunLevelPrice(gunLevel: number, planetIndex: number): Money {
  const { band, oreUnits, ratio } = gun.levelCost
  const units = growGeometric(oreUnits, ratio, gunLevel - MOUNTED_LEVEL)
  return bandOrePrice({ band, oreUnits: units }, planetIndex)
}

/** The price of the next gun buy from `gunLevel` (0: the mount). */
export function nextGunPrice(gunLevel: number, planetIndex: number): Money {
  return gunLevel < MOUNTED_LEVEL
    ? gunMountPrice(planetIndex)
    : gunLevelPrice(gunLevel, planetIndex)
}

export function gunLevelCostCurveId(): string {
  return gun.levelCost.id
}

function bandOrePrice({ band, oreUnits }: BandOreCost, planetIndex: number): Money {
  const cargoValue = mul(oreUnits, oreValue(oreTier(planetIndex, band)))
  return ceilMilli(mul(cargoValue, paceScale(planetIndex)))
}
