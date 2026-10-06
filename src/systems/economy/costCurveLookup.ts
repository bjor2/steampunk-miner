/** Finds a named curve of `economy.json`'s `costCurves` and checks its family before pricing. */
import { ECONOMY } from './economy'
import type { BandOreCostCurve, CostCurve, GeometricCostCurve } from './economyDefinition'

export function geometricCurveOf(curveId: string): GeometricCostCurve {
  const curve = curveOf(curveId)
  if (curve.family !== 'geometric') throw new RangeError(`cost curve ${curveId} is not geometric`)
  return curve
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
