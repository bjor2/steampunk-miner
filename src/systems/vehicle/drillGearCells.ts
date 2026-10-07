/**
 * Where slice drill gear cuts (GD lock on #205, ticket 234), from the drill's stamp at a pose: the
 * cells just past the stamp's rim along the facing (the reach boom) and just past it on each side
 * of the bore (side cutters), one metre apart, in whole millimetres from the integer pose so every
 * machine lists the same tiles. A cell holds the tile under the point half a cell past the rim, so
 * only its samples outside the disc are left for it to cut (`cellSamplesBesideDisc`).
 *
 * The twin bit's bearing (GD lock on #257, ticket 279) turns the ahead cells 45 degrees to the
 * facing's left or right: each sits one metre further toward that side than the facing's cell, so
 * driving down and to a side the ahead cell is the one diagonally below the bit, one column over
 * and one row down on the tile grid. It replaces the facing's cell; it never adds one. Which bearing
 * a cut takes is the drive's, latched per cell (`aheadBearingLatch.ts`).
 *
 * Order: the ahead cells nearest first, then the side cells nearest first, the facing's left side
 * before its right. A tile met twice is listed once.
 */
import { MM_PER_METRE, UP_VECTOR_SCALE } from '../../constants/physics'
import type { AheadBearing, DrillGear } from '../economy/drillGearCaps'
import type { DiscStamp } from '../world/stampShape'
import type { TilePoint } from '../world/tileGrid'
import {
  facingVectorOf,
  tileOfMillimetres,
  type IntegerVector,
  type VehiclePose,
} from './vehiclePose'

export interface DrillGearCells {
  ahead: TilePoint[]
  side: TilePoint[]
}

/** The gear's cell counts, and where the ahead cells point (along the facing when left out). */
export type DrillGearReach = Pick<DrillGear, 'aheadCells' | 'sideCells'> & {
  aheadBearing?: AheadBearing
}

const NO_SHIFT: IntegerVector = { x: 0, y: 0 }

export function drillGearCellsAt(
  pose: VehiclePose,
  stamp: DiscStamp,
  gear: DrillGearReach,
): DrillGearCells {
  const ahead = facingVectorOf(pose.upx, pose.upy, pose.facing)
  const left = { x: -ahead.y, y: ahead.x }
  const right = { x: ahead.y, y: -ahead.x }
  const shift = bearingShiftOf({ left, right }, gear.aheadBearing ?? 'facing')
  const aheadTiles = cellsAlong(stamp, [ahead], gear.aheadCells, shift)
  const sideTiles = cellsAlong(stamp, [left, right], gear.sideCells, NO_SHIFT)
  return { ahead: aheadTiles, side: withoutTiles(sideTiles, aheadTiles) }
}

/** The side a diagonal bearing shifts the ahead cells toward; none along the facing. */
function bearingShiftOf(
  sides: { left: IntegerVector; right: IntegerVector },
  bearing: AheadBearing,
): IntegerVector {
  return bearing === 'facing' ? NO_SHIFT : sides[bearing]
}

/**
 * `count` cells out from the rim along each direction, nearest first, each tile once, each
 * shifted one more metre along the 1024-scaled `shift` per step: a 45-degree line for a diagonal.
 */
function cellsAlong(
  stamp: DiscStamp,
  directions: readonly IntegerVector[],
  count: number,
  shift: IntegerVector,
): TilePoint[] {
  const tiles: TilePoint[] = []
  for (let step = 0; step < count; step++) {
    for (const direction of directions) tiles.push(cellPastRim(stamp, direction, step, shift))
  }
  return withoutTiles(tiles, [])
}

/** The tile `step` whole cells beyond the first one past the rim along a 1024-scaled direction. */
function cellPastRim(
  stamp: DiscStamp,
  direction: IntegerVector,
  step: number,
  shift: IntegerVector,
): TilePoint {
  const reachMm = stamp.radiusMm + MM_PER_METRE / 2 + step * MM_PER_METRE
  const shiftMm = (step + 1) * MM_PER_METRE
  return tileOfMillimetres(
    stamp.xMm + scaled(direction.x, reachMm) + scaled(shift.x, shiftMm),
    stamp.yMm + scaled(direction.y, reachMm) + scaled(shift.y, shiftMm),
  )
}

/** A component of a 1024-scaled unit vector, times a length in mm, in whole mm. */
function scaled(component: number, lengthMm: number): number {
  return Math.floor((component * lengthMm) / UP_VECTOR_SCALE)
}

/** The tiles in order, each once, leaving out any in `taken`. */
function withoutTiles(tiles: readonly TilePoint[], taken: readonly TilePoint[]): TilePoint[] {
  const seen = new Set(taken.map(keyOfTile))
  const kept: TilePoint[] = []
  for (const tile of tiles) {
    const key = keyOfTile(tile)
    if (seen.has(key)) continue
    seen.add(key)
    kept.push(tile)
  }
  return kept
}

function keyOfTile({ tx, ty }: TilePoint): string {
  return `${tx},${ty}`
}
