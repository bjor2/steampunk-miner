/**
 * The Refinery bay's numbers (#105 numbers section), all read from `economy.json` `refinery`:
 *   batch cap      floor(batchCargoFraction * cargoCapacity) ore units of one tier
 *   refined value  floorMilli(units * V(t) * valueMultiplier), paid at the Sell bay only
 *   slot price     ceilMilli(oreUnitsByLevel[k] * V(t(p, band)) * paceScale(p)), the travel-fee
 *                  shape: slot 2 costs 20 band-5 ore units at the buyer's planet, slot 3 costs 40
 * The tier carries its planet (`t = 3(p-1) + b`), so a batch's value is fixed when it is queued
 * and travelling never changes it.
 */
import {
  add,
  cmp,
  floor,
  floorMilli,
  fromSafeInteger,
  mul,
  toSafeInteger,
  type Money,
} from '../money'
import { bandOrePrice } from './bandOreCost'
import { bandOreCurveOf } from './costCurveLookup'
import { ECONOMY } from './economy'
import { oreSalePrice, oreValue } from './oreEconomy'
import { compoundRatio } from './curveFamilies'

const { refinery } = ECONOMY
const ONE = fromSafeInteger(1)

/** The first planet whose platform has the Refinery bay (the `refinery_bay` row, `bind: facility`). */
export function refineryUnlockPlanet(): number {
  return refinery.unlockPlanet
}

/** Slots a new refinery has, and the most it can be raised to. */
export function refinerySlotsStart(): number {
  return refinery.slotsStart
}

export function refinerySlotsMax(): number {
  return refinery.slotsMax
}

/** How long a batch refines, in sim seconds (never the wall clock). */
export function refineSeconds(): number {
  return refinery.refineSeconds
}

/** The most ore one batch takes from a hold of `cargoCapacity` units. */
export function refineBatchCap(cargoCapacity: number): number {
  return toSafeInteger(floor(mul(refinery.batchCargoFraction, fromSafeInteger(cargoCapacity))))
}

/** What the batch pays when it is collected at the Sell bay. */
export function refinedValue(tier: number, units: number): Money {
  return floorMilli(mul(mul(fromSafeInteger(units), oreValue(tier)), refinery.valueMultiplier))
}

/** What the same ore would have sold for raw: `units * floorMilli(V(t))`, the Sell bay's price. */
export function rawRefineValue(tier: number, units: number): Money {
  return mul(oreSalePrice(tier), fromSafeInteger(units))
}

/** The price of the next slot for a refinery holding `slots`, or null at `slotsMax`. */
export function refinerySlotPrice(planetIndex: number, slots: number): Money | null {
  const curve = bandOreCurveOf(refinery.slotCostCurveId)
  const oreUnits = curve.oreUnitsByLevel[slots - refinery.slotsStart]
  if (oreUnits === undefined) return null
  return bandOrePrice({ band: curve.band, oreUnits }, planetIndex)
}

/**
 * The break-even of #105: money held back in a batch could have grown by `growthPerMinute` a
 * minute (bot income compounds about 2.5% a minute), so refining wins only while
 * `valueMultiplier > (1 + growthPerMinute)^waitMinutes`.
 */
export function doesRefiningBeatSelling(waitMinutes: number, growthPerMinute: Money): boolean {
  const growthFactor = compoundRatio(add(ONE, growthPerMinute), waitMinutes)
  return cmp(refinery.valueMultiplier, growthFactor) > 0
}
