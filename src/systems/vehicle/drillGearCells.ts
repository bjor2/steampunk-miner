/**
 * Where slice drill gear cuts (GD lock on #205, ticket 234), from the drill's stamp at a pose: the
 * cells just past the stamp's rim along the facing (the reach boom) and just past it on each side
 * of the bore (side cutters), one metre apart, in whole millimetres from the integer pose so every
 * machine lists the same tiles. A cell holds the tile under the point half a cell past the rim, so
 * only its samples outside the disc are left for it to cut (`cellSamplesBesideDisc`).
 *
 * Order: the ahead cells nearest first, then the side cells nearest first, the facing's left side
 * before its right. A tile met twice is listed once.
 */
import { MM_PER_METRE, UP_VECTOR_SCALE } from '../../constants/physics'
import type { DrillGear } from '../economy/drillGearCaps'
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

export function drillGearCellsAt(
  pose: VehiclePose,
  stamp: DiscStamp,
  gear: Pick<DrillGear, 'aheadCells' | 'sideCells'>,
): DrillGearCells {
  const ahead = facingVectorOf(pose.upx, pose.upy, pose.facing)
  const left = { x: -ahead.y, y: ahead.x }
  const right = { x: ahead.y, y: -ahead.x }
  const aheadTiles = cellsAlong(stamp, [ahead], gear.aheadCells)
  const sideTiles = cellsAlong(stamp, [left, right], gear.sideCells)
  return { ahead: aheadTiles, side: withoutTiles(sideTiles, aheadTiles) }
}

/** `count` cells out from the rim along each direction, nearest first, each tile once. */
function cellsAlong(
  stamp: DiscStamp,
  directions: readonly IntegerVector[],
  count: number,
): TilePoint[] {
  const tiles: TilePoint[] = []
  for (let step = 0; step < count; step++) {
    for (const direction of directions) tiles.push(cellPastRim(stamp, direction, step))
  }
  return withoutTiles(tiles, [])
}

/** The tile `step` whole cells beyond the first one past the rim along a 1024-scaled direction. */
function cellPastRim(stamp: DiscStamp, direction: IntegerVector, step: number): TilePoint {
  const reachMm = stamp.radiusMm + MM_PER_METRE / 2 + step * MM_PER_METRE
  return tileOfMillimetres(
    stamp.xMm + Math.floor((direction.x * reachMm) / UP_VECTOR_SCALE),
    stamp.yMm + Math.floor((direction.y * reachMm) / UP_VECTOR_SCALE),
  )
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
