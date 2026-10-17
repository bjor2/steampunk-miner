/**
 * Ore per solid tile at a tile's depth, from the depth density curve (ticket 448,
 * `economy/depthDensityCurve.ts`): the depth is the tile centre's distance below the surface as a
 * fraction of the radius, `d = 1 - r / R`, so the curve fits any planet size. Square root and
 * floor only, so a co-op guest reads the same depth (#4 acceptance 7).
 */
import { DEPTH_SUBSTEPS_PER_TABLE_STEP } from '../../constants/balance'
import { depthDensityBpAt } from '../economy/depthDensityCurve'
import { ECONOMY } from '../economy/economy'
import type { PlanetParams } from './planetParams'
import { halfTileDistanceSq, type TilePoint } from './tileGrid'

const CURVE = ECONOMY.planets.depthDensity
const DEPTH_SUBSTEPS = CURVE.tableSteps * DEPTH_SUBSTEPS_PER_TABLE_STEP

/** The curve's ore per solid tile at the tile's depth, in basis points. */
export function depthDensityBpOfTile(params: PlanetParams, tile: TilePoint): number {
  return depthDensityBpAt(CURVE, depthSubstepsOfTile(params, tile))
}

/** `d` in `DEPTH_SUBSTEPS` of the radius, rounded down: 0 at the surface, the whole at the centre. */
function depthSubstepsOfTile(params: PlanetParams, tile: TilePoint): number {
  const twiceRadius = 2 * params.radiusTiles
  const fromCentre = Math.sqrt(halfTileDistanceSq(tile.tx, tile.ty))
  return Math.floor((DEPTH_SUBSTEPS * (twiceRadius - fromCentre)) / twiceRadius)
}
