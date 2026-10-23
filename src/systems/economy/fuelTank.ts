/**
 * The fuel tank track (ticket 756; GD lock on #650, comment 6361556890, and the Systems ruling on
 * #756): its own track, separate from the boiler, gated by price alone and uncapped. A vehicle
 * starts at level 1, whose tank holds the next hop and the trip back; each purchase raises the
 * level by one.
 *
 *   capacity(n)          = floor(C0 * 1.3^(n-1))     whole fuel units, 10 at level 1
 *   price of n -> n + 1  = ceilMilli(P0 * 1.3^(n-1))  money, 250 for the first purchase
 *
 * Both are BigStats through `growGeometric` (integer exponents, #5 rule 1), so a level past any
 * double's reach still prices exactly.
 */
import { ceilMilli, floor, type BigStat, type Money } from '../money'
import { growGeometric } from './curveFamilies'
import { ECONOMY } from './economy'

const { tank } = ECONOMY.starMap.fuel

/** The level every vehicle starts at, before any tank purchase. */
export const FIRST_FUEL_TANK_LEVEL = 1

/** The whole fuel units a tank of `level` holds. */
export function fuelTankCapacityOf(level: number): BigStat {
  return floor(growGeometric(tank.capacityAtLevel1, tank.capacityRatio, stepsAbove(level)))
}

/** What raising the tank from `level` to `level + 1` costs. */
export function fuelTankPriceOf(level: number): Money {
  return ceilMilli(growGeometric(tank.priceAtLevel1, tank.priceRatio, stepsAbove(level)))
}

function stepsAbove(level: number): number {
  return level - FIRST_FUEL_TANK_LEVEL
}
