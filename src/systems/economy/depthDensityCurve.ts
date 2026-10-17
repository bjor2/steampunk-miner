/**
 * The depth density curve (Systems on #139, comment 6202970624 section 3; ticket 448), the
 * `planets.depthDensity` block of economy.json: ore per solid tile grows with depth as
 * `rho(d) = S * (f + (1 - f) * d^gamma)`, `d` the depth as a fraction of the radius, with
 * f = 0.10 (`floorBp` 1000), gamma = 0.375 and S pinned so band 5 keeps today's 22% (`scaleBp` 2239).
 * The surface is bare (2.2%) and the deep bands carry the ore, on any planet size.
 *
 * The curve ships as `tableBp`, `tableSteps + 1` integer basis points at `d = i / tableSteps`, and
 * is read by linear interpolation, so no `pow` runs in the game (the table is checked against the
 * formula by its spec). `bandMeanBp` is Systems' table of band means (7.92, 13.37, 17.72, 20.53,
 * 22.00%), the ore per tile a planet under the curve expects of each band. `fromPlanet` is the GD
 * ruling on ticket 448: planets 1 and 2 keep the step-band rows.
 */
import { BASIS_POINTS, DEPTH_SUBSTEPS_PER_TABLE_STEP } from '../../constants/balance'
import type { BigStat } from '../money'
import { BAND_COUNT } from '../world/planetGeometry'
import type { FieldReader } from './economyFieldReader'

export interface DepthDensityCurve {
  /** The first planet whose ore follows the curve; earlier ones keep the step-band rows. */
  fromPlanet: number
  floorBp: number
  /** The exponent as Systems wrote it; the game reads only the table built from it. */
  gamma: BigStat
  scaleBp: number
  /** Ore per solid tile of bands 1 to 5 under the curve, in basis points. */
  bandMeanBp: readonly number[]
  tableSteps: number
  /** `rho(i / tableSteps)` in basis points, for i from 0 to `tableSteps`. */
  tableBp: readonly number[]
}

const PATH = 'planets.depthDensity'

export function readDepthDensity(reader: FieldReader, value: unknown): DepthDensityCurve {
  const curve = reader.object(PATH, value)
  const read = {
    fromPlanet: reader.safeInteger(`${PATH}.fromPlanet`, curve.fromPlanet),
    floorBp: basisPointsOf(reader, 'floorBp', curve.floorBp),
    gamma: reader.money(`${PATH}.gamma`, curve.gamma),
    scaleBp: basisPointsOf(reader, 'scaleBp', curve.scaleBp),
    bandMeanBp: basisPointListOf(reader, 'bandMeanBp', curve.bandMeanBp),
    tableSteps: reader.safeInteger(`${PATH}.tableSteps`, curve.tableSteps),
    tableBp: basisPointListOf(reader, 'tableBp', curve.tableBp),
  }
  recordShapeProblems(reader, read)
  return read
}

/**
 * `rho` in basis points at `depthSubsteps / (tableSteps * 256)` of the radius, linearly between
 * the two table entries around it, rounded down; a depth past either end reads the end entry.
 */
export function depthDensityBpAt(curve: DepthDensityCurve, depthSubsteps: number): number {
  const last = curve.tableSteps * DEPTH_SUBSTEPS_PER_TABLE_STEP
  const at = Math.min(last, Math.max(0, depthSubsteps))
  const step = Math.floor(at / DEPTH_SUBSTEPS_PER_TABLE_STEP)
  const within = at - step * DEPTH_SUBSTEPS_PER_TABLE_STEP
  if (within === 0) return curve.tableBp[step]
  const rise = curve.tableBp[step + 1] - curve.tableBp[step]
  return curve.tableBp[step] + Math.floor((rise * within) / DEPTH_SUBSTEPS_PER_TABLE_STEP)
}

function basisPointsOf(reader: FieldReader, field: string, value: unknown): number {
  const bp = reader.safeInteger(`${PATH}.${field}`, value)
  if (bp < 0 || bp > BASIS_POINTS) reader.record(`${PATH}.${field} must be 0 to ${BASIS_POINTS}`)
  return bp
}

function basisPointListOf(reader: FieldReader, field: string, value: unknown): number[] {
  return reader
    .list(`${PATH}.${field}`, value)
    .map((entry, index) => basisPointsOf(reader, `${field}[${index}]`, entry))
}

function recordShapeProblems(reader: FieldReader, curve: DepthDensityCurve): void {
  if (curve.fromPlanet < 1) reader.record(`${PATH}.fromPlanet must be 1 or later`)
  if (curve.bandMeanBp.length !== BAND_COUNT) {
    reader.record(`${PATH}.bandMeanBp must hold one entry per band, ${BAND_COUNT}`)
  }
  if (curve.tableSteps < 1 || curve.tableBp.length !== curve.tableSteps + 1) {
    reader.record(`${PATH}.tableBp must hold tableSteps + 1 entries, tableSteps at least 1`)
  }
  if (!isNonDecreasing(curve.tableBp)) reader.record(`${PATH}.tableBp must never fall with depth`)
}

function isNonDecreasing(values: readonly number[]): boolean {
  return values.every((value, at) => at === 0 || value >= values[at - 1])
}
