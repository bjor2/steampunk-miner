/**
 * What the platform charges on planet `p` (decision #6 section 4, #8, #10). Each is a multiple of
 * `V3 = V(t(p, 3))`, the mid-band ore value, times `paceScale(p)`, and is rounded up with
 * `ceilMilli` (#20 money rounding rule):
 *   charge   0.002 * V3 per energy unit
 *   repair   0.5 * V3 * hullLost / hullMax
 *   rescue   clamp(0.05 * money, 3 * V3, 30 * V3), never above current money
 *   travel   0.12 * 10 * V(t(p, 5))
 */
import { ceilMilli, cmp, div, mul, type BigStat, type Money } from '../money'
import { ECONOMY } from './economy'
import { oreTier, oreValue } from './oreEconomy'
import { paceScale } from './planetEconomy'

const { prices } = ECONOMY

export interface RescueFeeBounds {
  floor: Money
  cap: Money
}

/** The unrounded price of one energy unit (0.045 on planet 1), for display. */
export function energyUnitPrice(planetIndex: number): Money {
  return mul(prices.chargePerEnergyUnit, pacedReferenceValue(planetIndex))
}

/** Recharging `energyUnits` (6.75 for a full 150-unit tank on planet 1). */
export function rechargePrice(planetIndex: number, energyUnits: BigStat): Money {
  return ceilMilli(mul(energyUnitPrice(planetIndex), energyUnits))
}

/** Repairing `hullLost` of `hullMax` (11.25 for a full repair on planet 1). */
export function repairPrice(planetIndex: number, hullLost: BigStat, hullMax: BigStat): Money {
  const fullRepair = mul(prices.fullRepair, pacedReferenceValue(planetIndex))
  return ceilMilli(mul(fullRepair, div(hullLost, hullMax)))
}

/** 67.5 to 675 on planet 1. */
export function rescueFeeBounds(planetIndex: number): RescueFeeBounds {
  const referenceValue = pacedReferenceValue(planetIndex)
  return {
    floor: mul(prices.rescueFee.floor, referenceValue),
    cap: mul(prices.rescueFee.cap, referenceValue),
  }
}

/** The tow's fee; money 0 pays 0, so a rescue never strands a broke player (#9). */
export function rescueFee(planetIndex: number, money: Money): Money {
  const share = mul(prices.rescueFee.moneyFraction, money)
  const fee = ceilMilli(clampMoney(share, rescueFeeBounds(planetIndex)))
  return lowerOf(fee, money)
}

/** The money half of the travel gate (60.75 on planet 1); the core fragments are the rest. */
export function travelFee(planetIndex: number): Money {
  const { fraction, oreUnits, band } = prices.travelFee
  const cargoValue = mul(oreUnits, oreValue(oreTier(planetIndex, band)))
  return ceilMilli(mul(mul(fraction, cargoValue), paceScale(planetIndex)))
}

function pacedReferenceValue(planetIndex: number): Money {
  const referenceValue = oreValue(oreTier(planetIndex, prices.referenceBand))
  return mul(referenceValue, paceScale(planetIndex))
}

function clampMoney(amount: Money, bounds: RescueFeeBounds): Money {
  return lowerOf(higherOf(amount, bounds.floor), bounds.cap)
}

function lowerOf(a: Money, b: Money): Money {
  return cmp(a, b) <= 0 ? a : b
}

function higherOf(a: Money, b: Money): Money {
  return cmp(a, b) >= 0 ? a : b
}
