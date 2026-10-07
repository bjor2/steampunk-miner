/**
 * The cells a bore crosses (ticket 313, TD architecture point 2 on #309): an integer DDA walk
 * from the centre of the rig's tile along an integer direction, one tile at a time, so the same
 * bearing from the same tile always names the same cells on every machine.
 *
 * The ray leaves the tile centre, so it meets the next x boundary after `(2k + 1) / (2 |dx|)` of
 * its length and the next y boundary after `(2m + 1) / (2 |dy|)`; comparing the two
 * cross-multiplied picks the next step with no division. Where the ray runs exactly through a
 * corner it steps along x first, then y.
 */
import type { IntegerVector } from '../../vehicle/vehiclePose'
import type { TilePoint } from '../../world/tileGrid'

/** The `range` tiles after `start` along `direction`, in walk order; none for a zero direction. */
export function boreCellsFrom(
  start: TilePoint,
  direction: IntegerVector,
  range: number,
): TilePoint[] {
  if (direction.x === 0 && direction.y === 0) return []
  const cells: TilePoint[] = []
  const walk = { tx: start.tx, ty: start.ty, xCrossings: 0, yCrossings: 0 }
  while (cells.length < range) {
    stepAcrossNextBoundary(walk, direction)
    cells.push({ tx: walk.tx, ty: walk.ty })
  }
  return cells
}

/** The walk's tile and how many x and y tile boundaries it has crossed so far. */
interface Walk {
  tx: number
  ty: number
  xCrossings: number
  yCrossings: number
}

function stepAcrossNextBoundary(walk: Walk, direction: IntegerVector): void {
  if (isXBoundaryFirst(walk, direction)) {
    walk.tx += Math.sign(direction.x)
    walk.xCrossings += 1
  } else {
    walk.ty += Math.sign(direction.y)
    walk.yCrossings += 1
  }
}

/** `(2k + 1) / |dx| <= (2m + 1) / |dy|`, cross-multiplied; a zero component never crosses. */
function isXBoundaryFirst(walk: Walk, direction: IntegerVector): boolean {
  if (direction.x === 0) return false
  if (direction.y === 0) return true
  const toX = (2 * walk.xCrossings + 1) * Math.abs(direction.y)
  const toY = (2 * walk.yCrossings + 1) * Math.abs(direction.x)
  return toX <= toY
}
