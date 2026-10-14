/**
 * The bore gun's tracer as spray requests (ticket 314; the TD kernel lock on #314 section 4, the
 * kernel SprayLayer of ticket 348): sparks from the rig along the shot as it fires, and debris
 * and dust from each cell as it opens, thrown on along the line. Every request is `low`, so when
 * the pool is full the tracer drops first and a blast still throws its full counts; spray is
 * visual only and never gates a cell or its ore.
 *
 * Presentation maths in floats, written into one caller's scratch request so a burst of cells
 * allocates nothing. Positions are planet metres; a tile's centre is half a metre in.
 */
import type { SprayKind, SprayRequest } from '../../../../systems/render/sprayPool'
import { reticleEndOf, type PlaneVector } from './aimOnScreen'

const TILE_CENTRE = 0.5

export function createSprayScratch(): SprayRequest {
  return { kind: 'spark', x: 0, y: 0, dirX: 0, dirY: -1, count: 0, priority: 'low' }
}

/** Sparks at the rig's centre along the shot's bearing, in the rig's frame of `up`. */
export function writeMuzzleSpray(
  out: SprayRequest,
  rig: PlaneVector,
  up: PlaneVector,
  bearing: number,
  count: number,
): SprayRequest {
  const end = reticleEndOf(rig, up, bearing, 1)
  return writeSpray(out, 'spark', rig, end.x - rig.x, end.y - rig.y, count)
}

/** `kind` from the centre of tile `tx, ty`, flying on away from `from` (the rig that bored it). */
export function writeCellSpray(
  out: SprayRequest,
  kind: SprayKind,
  tx: number,
  ty: number,
  from: PlaneVector,
  count: number,
): SprayRequest {
  const centre = { x: tx + TILE_CENTRE, y: ty + TILE_CENTRE }
  return writeSpray(out, kind, centre, centre.x - from.x, centre.y - from.y, count)
}

function writeSpray(
  out: SprayRequest,
  kind: SprayKind,
  at: PlaneVector,
  towardX: number,
  towardY: number,
  count: number,
): SprayRequest {
  const length = Math.hypot(towardX, towardY)
  out.kind = kind
  out.x = at.x
  out.y = at.y
  out.dirX = length === 0 ? 0 : towardX / length
  out.dirY = length === 0 ? 1 : towardY / length
  out.count = count
  out.priority = 'low'
  return out
}
