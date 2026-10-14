/** Finds a named curve of `economy.json`'s `costCurves` and checks its family before pricing. */
import type { Money } from '../money'
import { growGeometric } from './curveFamilies'
import { ECONOMY } from './economy'
import type {
  BandOreCostCurve,
  CostCurve,
  GeometricCostCurve,
  GeometricCurvePiece,
} from './economyDefinition'

export function geometricCurveOf(curveId: string): GeometricCostCurve {
  const curve = curveOf(curveId)
  if (curve.family !== 'geometric') throw new RangeError(`cost curve ${curveId} is not geometric`)
  return curve
}

/** The piece of a geometric curve that prices `level`: the curve's own start, or a later piece. */
export function geometricPieceAt(curve: GeometricCostCurve, level: number): GeometricCurvePiece {
  const later = (curve.pieces ?? []).filter((piece) => piece.fromLevel <= level)
  return later.at(-1) ?? { fromLevel: 0, base: curve.base, ratio: curve.ratio }
}

/** `base * ratio^(level - fromLevel)` of the piece pricing `level`, before rounding. */
export function geometricWorthAt(curve: GeometricCostCurve, level: number): Money {
  const piece = geometricPieceAt(curve, level)
  return growGeometric(piece.base, piece.ratio, level - piece.fromLevel)
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
