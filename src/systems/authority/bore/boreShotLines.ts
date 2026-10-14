/**
 * The lines one shot bores (ticket 377, the TD lock on #318): the aimed line, plus a shape's
 * offset lines, each walked from the rig's tile with at most the shape's same-ore seam turns. The
 * lines come in sorted-offset order, the aimed one at offset 0 among them, and two offsets that
 * clamp to the same bearing bore one line. A cell two lines share is left to the clock: the first
 * line to reach it opens it, and the other passes it open.
 *
 * Integer walks over the ground as it stands when the shot fires; no randomness.
 */
import { tileOfPose, type VehiclePose } from '../../vehicle/vehiclePose'
import type { ShotShape } from '../../registries/boreGun'
import { cellDensitySum } from '../../world/cellYield'
import type { PlanetParams } from '../../world/planetParams'
import type { TilePoint } from '../../world/tileGrid'
import { CELL_KIND, kindOfCell } from '../../world/worldCell'
import { materialCellAt, type WorldState } from '../../world/worldState'
import { boreDirectionOf, clampedBearing, isTileOffsetInArc, offsetBearingOf } from './boreAim'
import { boreCellsFrom, seamCellsFrom, type SeamGround } from './boreWalk'

/** The cells the clamped bearing crosses from the rig's tile, in walk order. */
export function lineOf(pose: VehiclePose, aimed: number, rangeCells: number): TilePoint[] {
  return boreCellsFrom(tileOfPose(pose), directionOf(pose, clampedBearing(aimed)), rangeCells)
}

/** Each line's cells in sorted-offset order; with no shape, the one aimed line. */
export function shotLinesOf(
  world: WorldState,
  params: PlanetParams,
  pose: VehiclePose,
  aimed: number,
  rangeCells: number,
  shape: ShotShape | null,
): TilePoint[][] {
  if (shape === null) return [lineOf(pose, aimed, rangeCells)]
  const ground = seamGroundOf(world, params, pose)
  return lineBearingsOf(aimed, shape.lineOffsets).map((bearing) =>
    seamCellsFrom(
      tileOfPose(pose),
      directionOf(pose, bearing),
      rangeCells,
      shape.seamTurns,
      ground,
    ),
  )
}

/** The bearing of each line: offset 0 and the shape's, sorted, clamped, one line per bearing. */
export function lineBearingsOf(aimed: number, lineOffsets: readonly number[]): number[] {
  const offsets = [...new Set([0, ...lineOffsets])].sort((a, b) => a - b)
  const bearings = offsets.map((offset) => offsetBearingOf(aimed, offset))
  return bearings.filter((bearing, index) => bearings.indexOf(bearing) === index)
}

function directionOf(pose: VehiclePose, bearing: number) {
  return boreDirectionOf({ x: pose.upx, y: pose.upy }, bearing)
}

/** The ground a seam walk reads: solid ore cells, and the arc round the rig's tile. */
function seamGroundOf(world: WorldState, params: PlanetParams, pose: VehiclePose): SeamGround {
  const rig = tileOfPose(pose)
  const up = { x: pose.upx, y: pose.upy }
  return {
    oreAt: (tile) => solidOreAt(world, params, tile),
    isInArc: (tile) => isTileOffsetInArc(up, { x: tile.tx - rig.tx, y: tile.ty - rig.ty }),
  }
}

function solidOreAt(world: WorldState, params: PlanetParams, tile: TilePoint): number | null {
  const material = materialCellAt(world, params, tile)
  if (kindOfCell(material) !== CELL_KIND.ore) return null
  return cellDensitySum(world, params, tile) > 0 ? material : null
}
