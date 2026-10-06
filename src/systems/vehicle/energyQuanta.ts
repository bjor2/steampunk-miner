/**
 * Energy in integer quanta (decision #11 amendment 2): 240 per unit, so the #6 rates of 1, 1.5 and
 * 0.25 units per second are exactly 4, 6 and 1 quanta per 1/60 s tick for drilling, thrust and
 * driving, and 10^6 ticks of mixed use never drift. The rates come from `economy.json`; a rate
 * that is not a whole number of quanta per tick fails at load instead of rounding.
 */
import { ENERGY_QUANTA_PER_UNIT } from '../../constants/balance'
import { TICKS_PER_SECOND } from '../../constants/physics'
import { ECONOMY } from '../economy/economy'
import { rescueEnergyFloor } from '../economy/vehicleStats'
import {
  ceil,
  div,
  fromCanonical,
  fromSafeInteger,
  isNonNegativeMoneyText,
  mul,
  toSafeInteger,
} from '../money'
import type { BigStat } from '../money'

export interface EnergyQuantaPerTick {
  drill: number
  thrust: number
  drive: number
}

const QUANTA_PER_UNIT = fromSafeInteger(ENERGY_QUANTA_PER_UNIT)

export const ENERGY_QUANTA_PER_TICK: EnergyQuantaPerTick = {
  drill: quantaPerTickOf(ECONOMY.energy.perSecond.drill),
  thrust: quantaPerTickOf(ECONOMY.energy.perSecond.thrust),
  drive: quantaPerTickOf(ECONOMY.energy.perSecond.drive),
}

/** One `auto_guns` shot (#107 numbers: half a unit, the same per second as drilling at 2 shots/s). */
export const GUN_SHOT_QUANTA: number = toSafeInteger(mul(ECONOMY.energy.perShot, QUANTA_PER_UNIT))

function quantaPerTickOf(unitsPerSecond: BigStat): number {
  return toSafeInteger(div(mul(unitsPerSecond, QUANTA_PER_UNIT), fromSafeInteger(TICKS_PER_SECOND)))
}

/**
 * What a rescue tow always leaves, 25% of `energyMax` (#6, #9), rounded up to a whole quantum so
 * the floor is never missed. The guns stop short of it too (#107).
 */
export function rescueFloorQuanta(boilerLevel: number): number {
  return toSafeInteger(ceil(mul(rescueEnergyFloor(boilerLevel), QUANTA_PER_UNIT)))
}

/** A whole number of energy units (an `energyMax`) as quanta. */
export function quantaOfUnits(units: number): number {
  return units * ENERGY_QUANTA_PER_UNIT
}

/**
 * A decimal string of units (the debug `setEnergy`) as quanta, or null when it is negative,
 * malformed or not a whole number of quanta.
 */
export function quantaOfUnitText(units: string): number | null {
  if (!isNonNegativeMoneyText(units)) return null
  try {
    return toSafeInteger(mul(fromCanonical(units), QUANTA_PER_UNIT))
  } catch {
    return null
  }
}

/** Whether a tank holds `percent` of its capacity or less, compared exactly in integers. */
export function isAtOrBelowPercent(quanta: number, maxQuanta: number, percent: number): boolean {
  return quanta * 100 <= maxQuanta * percent
}
