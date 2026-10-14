/**
 * The cells a bore crosses (ticket 313, TD architecture point 2 on #309): an integer DDA walk
 * from the centre of the rig's tile along an integer direction, one tile at a time, so the same
 * bearing from the same tile always names the same cells on every machine.
 *
 * The ray leaves the tile centre, so it meets the next x boundary after `(2k + 1) / (2 |dx|)` of
 * its length and the next y boundary after `(2m + 1) / (2 |dy|)`; comparing the two
 * cross-multiplied picks the next step with no division. Where the ray runs exactly through a
 * corner it steps along x first, then y.
 *
 * A seam walk (ticket 377, Content's rifled bore on #310) takes the same steps, except that after
 * its first ore cell, where the line would leave that ore, it may jog one tile sideways or ahead
 * onto a 4-neighbour of the same ore inside the arc, up to `seamTurns` times; the walk then goes on
 * from there along the same direction. A jog is a cell of the range, so the line never grows.
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

/** What a seam walk reads of the ground: a cell's ore, and whether a tile lies in the arc. */
export interface SeamGround {
  /** The cell's packed ore while it is still solid ore; null for anything else. */
  oreAt(tile: TilePoint): number | null
  isInArc(tile: TilePoint): boolean
}

/** `boreCellsFrom` with up to `seamTurns` jogs onto the first ore's seam, in walk order. */
export function seamCellsFrom(
  start: TilePoint,
  direction: IntegerVector,
  range: number,
  seamTurns: number,
  ground: SeamGround,
): TilePoint[] {
  if (direction.x === 0 && direction.y === 0) return []
  const walk = { tx: start.tx, ty: start.ty, xCrossings: 0, yCrossings: 0 }
  const seam: Seam = { ore: null, turnsLeft: seamTurns }
  const cells: TilePoint[] = []
  while (cells.length < range) {
    const cell = nextSeamCell(walk, direction, seam, { start, cells, ground })
    cells.push(cell)
    if (seam.ore === null) seam.ore = ground.oreAt(cell)
  }
  return cells
}

/** What the walk has behind it: where it began, the cells it took, and the ground it reads. */
interface SeamTrail {
  start: TilePoint
  cells: readonly TilePoint[]
  ground: SeamGround
}

interface Seam {
  ore: number | null
  turnsLeft: number
}

/** The jog onto the seam when the line would leave it here, else the straight step. */
function nextSeamCell(
  walk: Walk,
  direction: IntegerVector,
  seam: Seam,
  trail: SeamTrail,
): TilePoint {
  const ahead = { ...walk }
  stepAcrossNextBoundary(ahead, direction)
  const jog = seamJogOf(walk, { tx: ahead.tx, ty: ahead.ty }, direction, seam, trail)
  if (jog === null) {
    Object.assign(walk, ahead)
    return { tx: walk.tx, ty: walk.ty }
  }
  seam.turnsLeft -= 1
  walk.tx = jog.tx
  walk.ty = jog.ty
  return jog
}

/** The neighbour the line jogs onto, or null when it stays straight. */
function seamJogOf(
  walk: Walk,
  ahead: TilePoint,
  direction: IntegerVector,
  seam: Seam,
  trail: SeamTrail,
): TilePoint | null {
  const here = { tx: walk.tx, ty: walk.ty }
  if (!isLeavingSeam(here, ahead, seam, trail)) return null
  return (
    jogStepsAlong(direction)
      .map((step) => ({ tx: here.tx + step.x, ty: here.ty + step.y }))
      .find((tile) => isJogOnto(tile, ahead, seam, trail)) ?? null
  )
}

/** On the seam's ore now, with a turn left, and the straight step would leave it. */
function isLeavingSeam(here: TilePoint, ahead: TilePoint, seam: Seam, trail: SeamTrail): boolean {
  if (seam.ore === null || seam.turnsLeft === 0) return false
  return trail.ground.oreAt(here) === seam.ore && trail.ground.oreAt(ahead) !== seam.ore
}

function isJogOnto(tile: TilePoint, ahead: TilePoint, seam: Seam, trail: SeamTrail): boolean {
  return (
    !isSameTile(tile, ahead) &&
    !isSameTile(tile, trail.start) &&
    !trail.cells.some((cell) => isSameTile(cell, tile)) &&
    trail.ground.oreAt(tile) === seam.ore &&
    trail.ground.isInArc(tile)
  )
}

const NEIGHBOUR_STEPS: readonly IntegerVector[] = [
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
  { x: 0, y: -1 },
]

/** The 4-neighbour steps that never go back against `direction`, most forward first, ties in table order. */
function jogStepsAlong(direction: IntegerVector): IntegerVector[] {
  return NEIGHBOUR_STEPS.filter((step) => dotOf(step, direction) >= 0).sort(
    (a, b) => dotOf(b, direction) - dotOf(a, direction),
  )
}

function dotOf(a: IntegerVector, b: IntegerVector): number {
  return a.x * b.x + a.y * b.y
}

function isSameTile(a: TilePoint, b: TilePoint): boolean {
  return a.tx === b.tx && a.ty === b.ty
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
