/**
 * Ricochet (ticket 382, Content's Ricochet shot on #310): a shell may bounce once off a wall to
 * reach an enemy no straight line reaches, behind a corner of a pocket. It never passes through
 * rock and deals a straight shot's damage.
 *
 * The bounce is a mirror image on the tile grid, in integer mm: for each cell face within
 * `bounceLegCells` of the enemy, with the rig and the enemy on the same side, the shot aims at the
 * enemy mirrored across the face and meets the face at one point. That point is a bounce when the
 * cell across the face is rock (the wall), the rig's leg and the enemy's leg are both open, the
 * enemy's leg is at most `bounceLegCells` long, both legs together stay within the guns' range
 * (Systems on #322: first leg plus bounce within `gunRangeCap`) and the guns may point down the
 * first leg. At most `2 * (2 * bounceLegCells + 1)` faces are tried, each with two line checks no
 * longer than the range, and only for an enemy the guns cannot reach straight.
 *
 * The ricochet module stays held until K-hollow (#387) adds the hollow-pocket cell read on the
 * bounce leg's cells.
 */
import { MM_PER_METRE } from '../../../constants/physics'
import { distanceSq, type MillimetrePoint } from './combatGeometry'
import { isAimable, isLineOpen, isOpenAt, type TurretSight } from './gunTargets'

type Axis = 'x' | 'y'

/** A cell face: the line `axis = wallMm`. */
interface CellFace {
  axis: Axis
  wallMm: number
}

/** Whether a shell bouncing once off a wall reaches `enemy` within `legCells` of the bounce. */
export function hasBouncePath(
  sight: TurretSight,
  enemy: MillimetrePoint,
  legCells: number,
): boolean {
  const from = sight.target.position
  return facesNear(from, enemy, legCells).some((face) => isBounceOff(sight, enemy, legCells, face))
}

/** The cell faces within `legCells` of the enemy that the rig and the enemy are on one side of. */
function facesNear(from: MillimetrePoint, enemy: MillimetrePoint, legCells: number): CellFace[] {
  const axes: Axis[] = ['x', 'y']
  return axes.flatMap((axis) =>
    wallsAround(enemy[axis], legCells)
      .filter((wallMm) => isSameSide(from[axis], enemy[axis], wallMm))
      .map((wallMm) => ({ axis, wallMm })),
  )
}

function isBounceOff(
  sight: TurretSight,
  enemy: MillimetrePoint,
  legCells: number,
  face: CellFace,
): boolean {
  const { terrain, rangeMm } = sight
  const from = sight.target.position
  const bounce = bouncePointOf(from, enemy, face)
  const legMm = legCells * MM_PER_METRE
  return (
    isWallAt(sight, acrossFaceOf(from, bounce, face)) &&
    distanceSq(bounce, enemy) <= legMm * legMm &&
    pathLengthMm(from, bounce, enemy) <= rangeMm &&
    isAimable(sight, from, bounce) &&
    isLineOpen(terrain, from, bounce) &&
    isLineOpen(terrain, bounce, enemy)
  )
}

/** Where the line to the enemy's mirror image meets the face, kept 1 mm on the rig's side. */
function bouncePointOf(
  from: MillimetrePoint,
  enemy: MillimetrePoint,
  { axis, wallMm }: CellFace,
): MillimetrePoint {
  const other: Axis = axis === 'x' ? 'y' : 'x'
  const mirrored = 2 * wallMm - enemy[axis]
  const along = Math.trunc(
    ((enemy[other] - from[other]) * (wallMm - from[axis])) / (mirrored - from[axis]),
  )
  const onFace = wallMm + Math.sign(from[axis] - wallMm)
  const sideways = from[other] + along
  return axis === 'x' ? { x: onFace, y: sideways } : { x: sideways, y: onFace }
}

/** The point just across the face from the bounce: the wall the shell strikes. */
function acrossFaceOf(
  from: MillimetrePoint,
  bounce: MillimetrePoint,
  { axis, wallMm }: CellFace,
): MillimetrePoint {
  // A face's own coordinate belongs to the cell above it, so the far side below is 1 mm under.
  const across = from[axis] < wallMm ? wallMm : wallMm - 1
  return axis === 'x' ? { x: across, y: bounce.y } : { x: bounce.x, y: across }
}

function isWallAt(sight: TurretSight, point: MillimetrePoint): boolean {
  return !isOpenAt(sight.terrain, point.x, point.y)
}

/** The faces (multiples of a tile) no further than `legCells` from `at`. */
function wallsAround(at: number, legCells: number): number[] {
  const reach = legCells * MM_PER_METRE
  const first = Math.ceil((at - reach) / MM_PER_METRE)
  const last = Math.floor((at + reach) / MM_PER_METRE)
  return Array.from({ length: last - first + 1 }, (_, index) => (first + index) * MM_PER_METRE)
}

function isSameSide(from: number, enemy: number, wallMm: number): boolean {
  return (from - wallMm) * (enemy - wallMm) > 0
}

/** Both legs' lengths, each floored to the mm. */
function pathLengthMm(
  from: MillimetrePoint,
  bounce: MillimetrePoint,
  enemy: MillimetrePoint,
): number {
  return lengthMm(from, bounce) + lengthMm(bounce, enemy)
}

/** `sqrt` is exact on every OS (IEEE 754 rounds it correctly), so a replay floors it the same. */
function lengthMm(from: MillimetrePoint, to: MillimetrePoint): number {
  return Math.floor(Math.sqrt(distanceSq(from, to)))
}
