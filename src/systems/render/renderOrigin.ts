/**
 * The client's floating origin (ticket 339, #316 scope e). Rapier and the GPU work in f32, whose
 * steps reach the 1 mm pose quantum 8,192 m from the planet's centre and half a pixel near 65 km.
 * So the client measures its physics and its drawing from a render origin near the rig instead:
 * an integer mm point on a 32 m chunk corner, moved only when the rig gets farther than a reach
 * (1 km) from it. Chunk meshes keep their chunk-corner placement, so a move rebuilds none. The
 * authority never sees the origin: poses, saves and the digest stay planet-centred integer mm.
 */
import { MM_PER_METRE } from '../../constants/physics'
import { CHUNK_SIZE } from '../world/tileGrid'

/** A chunk corner in planet-centred integer mm. */
export interface RenderOrigin {
  xMm: number
  yMm: number
}

/** Where every client frame starts before the rig is placed: the planet's centre. */
export const PLANET_CENTRE_ORIGIN: RenderOrigin = { xMm: 0, yMm: 0 }

const CHUNK_MM = CHUNK_SIZE * MM_PER_METRE

/** The chunk corner nearest a point in planet-centred mm. */
export function renderOriginNear(xMm: number, yMm: number): RenderOrigin {
  return { xMm: nearestChunkCornerMm(xMm), yMm: nearestChunkCornerMm(yMm) }
}

/** Whether a point in planet-centred mm is farther than `reachMm` from the origin. */
export function isPastOriginReach(
  origin: RenderOrigin,
  xMm: number,
  yMm: number,
  reachMm: number,
): boolean {
  const dx = xMm - origin.xMm
  const dy = yMm - origin.yMm
  return dx * dx + dy * dy > reachMm * reachMm
}

export function isSameOrigin(a: RenderOrigin, b: RenderOrigin): boolean {
  return a.xMm === b.xMm && a.yMm === b.yMm
}

/** `+ 0` keeps a corner at the centre from reading as -0. */
function nearestChunkCornerMm(mm: number): number {
  return Math.floor(mm / CHUNK_MM + 0.5) * CHUNK_MM + 0
}
