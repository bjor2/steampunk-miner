/** Finds a named curve of `economy.json`'s `costCurves` and checks its family before pricing. */
import { ceil, type Money } from '../money'
import { growGeometric } from './curveFamilies'
import { ECONOMY } from './economy'
import type {
  BandOreCostCurve,
  CostCurve,
  GeometricCostCurve,
  PurchaseCostCurve,
} from './economyDefinition'

export function geometricCurveOf(curveId: string): GeometricCostCurve {
  const curve = curveOf(curveId)
  if (curve.family !== 'geometric') throw new RangeError(`cost curve ${curveId} is not geometric`)
  return curve
}

/** `base * ratio^level` before rounding. */
export function geometricWorthAt(curve: GeometricCostCurve, level: number): Money {
  return growGeometric(curve.base, curve.ratio, level)
}

export function perPurchaseCurveOf(curveId: string): PurchaseCostCurve {
  const curve = curveOf(curveId)
  if (curve.family !== 'perPurchase' && curve.family !== 'geometricPerPurchase') {
    throw new RangeError(`cost curve ${curveId} is not priced per purchase`)
  }
  return curve
}

/**
 * The price of purchase `purchase` before `paceScale`: drill power's `firstPrice` at 0, else
 * `ceil(base * ratio^(purchase - 1))` (#551, ticket 552); the hold's, the boiler's and the
 * engine's `ceil(base * ratio^purchase)` from the first one (Systems' rows on #553, ticket 553).
 */
export function perPurchaseRowAt(curve: PurchaseCostCurve, purchase: number): Money {
  if (curve.family === 'geometricPerPurchase') {
    return ceil(growGeometric(curve.base, curve.ratio, purchase))
  }
  if (purchase === 0) return curve.firstPrice
  return ceil(growGeometric(curve.base, curve.ratio, purchase - 1))
}

export function bandOreCurveOf(curveId: string): BandOreCostCurve {
  const curve = curveOf(curveId)
  if (curve.family !== 'bandOre') throw new RangeError(`cost curve ${curveId} is not bandOre`)
  return curve
}

function curveOf(curveId: string): CostCurve {
  const curve = ECONOMY.costCurves.find((candidate) => candidate.id === curveId)
  if (curve === undefined) throw new RangeError(`no cost curve ${curveId}`)
  return curve
}
