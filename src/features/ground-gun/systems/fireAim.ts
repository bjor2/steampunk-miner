/**
 * Where an aim input points the bore gun (ticket 314; Gameplay's aim amendment on #309): an aim
 * in the rig's own frame, `along` its right-hand tangent and `down` away from its up, turns into
 * the bearing 0 to 255 of #313's table that points closest to it. The authority clamps again
 * whatever the client sends; the client snaps first so the reticle draws the line the shot will
 * really take.
 *
 * - An aim inside the cone 30° either side of straight down snaps to the 60° edge on the side of
 *   the input's along sign; exactly straight down uses the facing side.
 * - An aim above horizontal never fires upward: it lands on the horizontal on its side.
 * - A tap, or a stick at rest, fires along the facing: horizontal on the side the rig faces.
 *
 * Integer only: the table's own directions, compared by dot and cross product.
 */
import {
  BORE_BEARING_COUNT,
  boreDirectionOf,
  clampedBearing,
} from '../../../systems/authority/bore/boreAim'
import { FACING, type Facing } from '../../../systems/vehicle/vehiclePose'

/** An aim in the rig's frame, in any whole or fractional unit. */
export interface RigAim {
  /** Toward the rig's right (bearing 255's side). */
  along: number
  /** Away from the rig's up. */
  down: number
}

const FIRST_BEARING = 0
const LAST_BEARING = BORE_BEARING_COUNT - 1
/** In the table's frame an up of +y: a bearing's direction is `(along, -down)`. */
const TABLE_UP = { x: 0, y: 1 }
const LEFT_EDGE = clampedBearing(BORE_BEARING_COUNT / 2 - 1)
const RIGHT_EDGE = clampedBearing(BORE_BEARING_COUNT / 2)

/** Horizontal on the side the rig faces: left for a rig facing left, right otherwise. */
export function facingBearingOf(facing: Facing | null): number {
  return facing === FACING.left ? FIRST_BEARING : LAST_BEARING
}

/** The arc bearing an aim snaps to; a zero aim fires along the facing. */
export function bearingOfAim(aim: RigAim, facing: Facing | null): number {
  if (aim.along === 0 && aim.down === 0) return facingBearingOf(facing)
  if (aim.down < 0) return horizontalBearingOf(aim, facing)
  return snappedIntoArc(nearestBearingOf(aim), aim, facing)
}

/** An aim above the horizontal: the horizontal on its side, the facing side straight up. */
function horizontalBearingOf(aim: RigAim, facing: Facing | null): number {
  return isAimOnLeft(aim, facing) ? FIRST_BEARING : LAST_BEARING
}

/**
 * The table bearing pointing closest to the aim: the largest dot product, and on a tie (the
 * table rounds neighbouring directions to the same component) the smallest cross product.
 */
function nearestBearingOf(aim: RigAim): number {
  let best = FIRST_BEARING
  for (let bearing = FIRST_BEARING + 1; bearing <= LAST_BEARING; bearing++) {
    if (isCloserToAim(aim, bearing, best)) best = bearing
  }
  return best
}

function isCloserToAim(aim: RigAim, bearing: number, best: number): boolean {
  const dot = dotWithBearing(aim, bearing)
  const bestDot = dotWithBearing(aim, best)
  if (dot !== bestDot) return dot > bestDot
  return Math.abs(crossWithBearing(aim, bearing)) < Math.abs(crossWithBearing(aim, best))
}

function dotWithBearing(aim: RigAim, bearing: number): number {
  const direction = boreDirectionOf(TABLE_UP, bearing)
  return aim.along * direction.x - aim.down * direction.y
}

function crossWithBearing(aim: RigAim, bearing: number): number {
  const direction = boreDirectionOf(TABLE_UP, bearing)
  return -aim.along * direction.y - aim.down * direction.x
}

/** A bearing in the cone goes to the edge on the aim's side; straight down to the facing side. */
function snappedIntoArc(bearing: number, aim: RigAim, facing: Facing | null): number {
  if (clampedBearing(bearing) === bearing) return bearing
  return isAimOnLeft(aim, facing) ? LEFT_EDGE : RIGHT_EDGE
}

function isAimOnLeft(aim: RigAim, facing: Facing | null): boolean {
  if (aim.along === 0) return facing === FACING.left
  return aim.along < 0
}
