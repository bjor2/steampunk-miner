/**
 * Sale lifts as integer ratios on the bignum V(t) (TD ruling on #821, comment 6388180827, ticket
 * 844): every lift on an ore unit's sale price is a ratio `num/den` of whole numbers, never a
 * float, so two lifts compare exactly by cross-multiplying and the largest wins; lifts never
 * stack. A lifted unit sells at `floorMilli(V(t) · num/den)`, income rounded down per #681 and
 * #20, so the 1/1 lift is the plain `floorMilli(V(t))`.
 */
import { div, fromBigInt, integerRatioOf, mul, floorMilli, type Money } from '../money'
import { ECONOMY } from './economy'
import { oreValue } from './oreEconomy'

export interface SaleLift {
  num: bigint
  den: bigint
}

/** The plain price: every unit sells at least at V(t). */
export const NO_LIFT: SaleLift = { num: 1n, den: 1n }

/** Whether `lift` pays more than `than`. */
export function isLiftAbove(lift: SaleLift, than: SaleLift): boolean {
  return lift.num * than.den > than.num * lift.den
}

/** The largest of the lifts, the first of equals; `NO_LIFT` when none pays more. */
export function largestLift(lifts: readonly SaleLift[]): SaleLift {
  return lifts.reduce((best, lift) => (isLiftAbove(lift, best) ? lift : best), NO_LIFT)
}

/** One unit of `tier` at `lift`: `floorMilli(V(t) · num / den)`. */
export function liftedSalePrice(tier: number, lift: SaleLift): Money {
  return floorMilli(div(mul(oreValue(tier), fromBigInt(lift.num)), fromBigInt(lift.den)))
}

/** The most a premium lift may pay (VS on #821): 5/4. */
export function premiumLiftCap(): SaleLift {
  return integerRatioOf(ECONOMY.prices.orePremiumLiftCap)
}

/** `num/den` as the run log writes a lift. */
export function liftText(lift: SaleLift): string {
  return `${lift.num.toString()}/${lift.den.toString()}`
}

/** `lift` applied `steps` times: (3/2) twice is 9/4. */
export function liftToPower(lift: SaleLift, steps: number): SaleLift {
  return Array.from({ length: steps }).reduce<SaleLift>(
    (power) => ({ num: power.num * lift.num, den: power.den * lift.den }),
    NO_LIFT,
  )
}
