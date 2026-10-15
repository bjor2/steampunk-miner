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
 * The side cutters' Mark 3 hold (TD lock on #276) names a faced side: that side cuts `sideCells`,
 * the other only `offSideCells`, so the hold alone cuts one flank. With no faced side both cut
 * `sideCells`, as before.
 *
 * The scripted `drillTile` bores one cell, not the disc (ticket 392): its stamp here is half a cell
 * round the tile's centre (`cellStampOf`), so the ahead cells are the next tiles along the facing
 * past the bored one and the side cells the tiles beside it.
 *
 * Order: the ahead cells nearest first, then the side cells nearest first, the facing's left side
 * before its right. A tile met twice is listed once.
 */
import { MM_PER_METRE, UP_VECTOR_SCALE } from '../../constants/physics'
import type { AheadBearing, BoreSide, DrillGear } from '../economy/drillGearCaps'
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

/**
 * The gear's cell counts, where the ahead cells point (along the facing when left out), and the
 * faced side with the other side's count (both sides cut `sideCells` when left out).
 */
export type DrillGearReach = Pick<DrillGear, 'aheadCells' | 'sideCells'> & {
  aheadBearing?: AheadBearing
  facedSide?: BoreSide
  offSideCells?: number
}

/** A direction from the rim and how many cells it reaches. */
interface CellLine {
  direction: IntegerVector
  count: number
}

const NO_SHIFT: IntegerVector = { x: 0, y: 0 }

/** The stamp the gear reads round one bored cell: half a cell about the tile's centre. */
export function cellStampOf(tile: TilePoint): DiscStamp {
  const half = MM_PER_METRE / 2
  return {
    xMm: tile.tx * MM_PER_METRE + half,
    yMm: tile.ty * MM_PER_METRE + half,
    radiusMm: half,
    floorRadiusMm: null,
  }
}

export function drillGearCellsAt(
  pose: VehiclePose,
  stamp: DiscStamp,
  gear: DrillGearReach,
): DrillGearCells {
  const ahead = facingVectorOf(pose.upx, pose.upy, pose.facing)
  const left = { x: -ahead.y, y: ahead.x }
  const right = { x: ahead.y, y: -ahead.x }
  const shift = bearingShiftOf({ left, right }, gear.aheadBearing ?? 'facing')
  const aheadTiles = cellsAlong(stamp, [{ direction: ahead, count: gear.aheadCells }], shift)
  const sideTiles = cellsAlong(stamp, sideLinesOf({ left, right }, gear), NO_SHIFT)
  return { ahead: aheadTiles, side: withoutTiles(sideTiles, aheadTiles) }
}

/** The left side's line, then the right's: the faced one at `sideCells`, the other at its own. */
function sideLinesOf(
  sides: { left: IntegerVector; right: IntegerVector },
  gear: DrillGearReach,
): CellLine[] {
  const countOf = (side: BoreSide) => sideCountOf(gear, side)
  return [
    { direction: sides.left, count: countOf('left') },
    { direction: sides.right, count: countOf('right') },
  ]
}

function sideCountOf(gear: DrillGearReach, side: BoreSide): number {
  if (gear.facedSide === undefined || gear.facedSide === side) return gear.sideCells
  return Math.min(gear.sideCells, gear.offSideCells ?? 0)
}

/** The side a diagonal bearing shifts the ahead cells toward; none along the facing. */
function bearingShiftOf(
  sides: { left: IntegerVector; right: IntegerVector },
  bearing: AheadBearing,
): IntegerVector {
  return bearing === 'facing' ? NO_SHIFT : sides[bearing]
}

/**
 * Each line's cells out from the rim, nearest first across the lines, each tile once, each
 * shifted one more metre along the 1024-scaled `shift` per step: a 45-degree line for a diagonal.
 */
function cellsAlong(
  stamp: DiscStamp,
  lines: readonly CellLine[],
  shift: IntegerVector,
): TilePoint[] {
  const tiles: TilePoint[] = []
  const steps = Math.max(0, ...lines.map((line) => line.count))
  for (let step = 0; step < steps; step++) {
    for (const line of lines.filter((candidate) => step < candidate.count)) {
      tiles.push(cellPastRim(stamp, line.direction, step, shift))
    }
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
