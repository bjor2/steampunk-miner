/**
 * How the spray layer draws one of option B's pops this frame (ticket 616): on its flight from
 * its start to the hold anchor in the rig's frame as the rig is drawn now, at its side, in its
 * colour (brightened while it glints), under the enemies, the nose riders and the collapse
 * telegraph (`POP_Z`). A pop holding merged cells shows its count through the badge presence.
 * Scratch is the caller's, so a frame allocates nothing.
 */
import type { Color, Object3D } from 'three'
import { POP_Z } from '../constants/materialPop'
import {
  planePointOf,
  popRigPointAt,
  type PlanePoint,
  type RigFrame,
  type RigPoint,
} from '../systems/materialPop/popFlight'
import { popGlintAt } from '../systems/materialPop/popLook'
import { popStartAt } from '../systems/render/popPieces'
import type { SprayPool } from '../systems/render/sprayPool'
import { showPopBadge } from './popBadgePresence'
import { renderOriginPresence } from './renderOriginPresence'

export interface PopPlacementScratch {
  rig: RigFrame
  start: RigPoint
  flown: RigPoint
  onPlanet: PlanePoint
}

export function createPopPlacementScratch(rig: RigFrame): PopPlacementScratch {
  return {
    rig,
    start: { along: 0, upward: 0 },
    flown: { along: 0, upward: 0 },
    onPlanet: { x: 0, y: 0 },
  }
}

/** Places the pop in slot `at` on `piece` and paints `colour`; badges it when merged. */
export function placePopPiece(
  pool: SprayPool,
  at: number,
  scratch: PopPlacementScratch,
  piece: Object3D,
  colour: Color,
): void {
  const point = popPlanePointAt(pool, at, scratch)
  const size = pool.pops.sizeM[at]
  piece.position.set(point.x - renderOriginPresence.x, point.y - renderOriginPresence.y, POP_Z)
  piece.rotation.set(0, 0, 0)
  piece.scale.set(size, size, 1)
  paintPop(pool, at, colour)
  if (pool.pops.count[at] > 1) showPopBadge(point.x, point.y, pool.pops.count[at])
}

function popPlanePointAt(pool: SprayPool, at: number, scratch: PopPlacementScratch): PlanePoint {
  const { age, life } = pool.particles
  const start = popStartAt(pool.pops, at, scratch.start)
  const flown = popRigPointAt(start, age[at], life[at], scratch.flown)
  return planePointOf(scratch.rig, flown, scratch.onPlanet)
}

function paintPop(pool: SprayPool, at: number, colour: Color): void {
  colour.setHex(pool.pops.colour[at])
  if (pool.pops.isGlinting[at] === 1) colour.multiplyScalar(1 + popGlintAt(pool.particles.age[at]))
}
