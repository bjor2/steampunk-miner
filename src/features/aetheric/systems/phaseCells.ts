/**
 * Where a phase goes (#261, the GD lock on #245 "phase: the one cell ahead", `aheadCells` 1): the
 * cell one metre along the facing from the vehicle's centre, the one the bit would cut next
 * (`noseTileOf`), and the landing cell one metre past it. Read off the integer pose in whole
 * millimetres, as the nose tile is, so every machine names the same cells.
 */
import { MM_PER_METRE, UP_VECTOR_SCALE } from '../../../constants/physics'
import {
  facingVectorOf,
  noseTileOf,
  tileOfMillimetres,
  type VehiclePose,
} from '../../../systems/vehicle/vehiclePose'
import type { TilePoint } from '../../../systems/world/tileGrid'

/** The cell the phase crosses and the cell it lands in. */
export interface PhaseCells {
  cell: TilePoint
  landing: TilePoint
}

const LANDING_METRES = 2

export function phaseCellsOf(pose: VehiclePose): PhaseCells {
  return { cell: noseTileOf(pose), landing: tileAlongFacingOf(pose, LANDING_METRES) }
}

/** The tile `metres` along the facing from the vehicle's centre, as `noseTileOf` reads one. */
function tileAlongFacingOf(pose: VehiclePose, metres: number): TilePoint {
  const facing = facingVectorOf(pose.upx, pose.upy, pose.facing)
  return tileOfMillimetres(
    pose.x + Math.floor((facing.x * metres * MM_PER_METRE) / UP_VECTOR_SCALE),
    pose.y + Math.floor((facing.y * metres * MM_PER_METRE) / UP_VECTOR_SCALE),
  )
}
