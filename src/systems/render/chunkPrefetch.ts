/**
 * The chunks built ahead of the view (TD scope on #316, ticket 330): the view circle moved
 * `CHUNK_PREFETCH_AHEAD_M` along the drill's facing, less the chunks already in view, nearest
 * first. A rig drilling straight on meets them built.
 */
import { CHUNK_PREFETCH_AHEAD_M } from '../../constants/scene'
import type { Vector2 } from '../vehicle/localFrame'
import { visibleChunksAround, type ChunkPoint } from './visibleChunks'

export function chunksAheadOf(
  centre: Vector2,
  viewRadius: number,
  ahead: Vector2,
  planetRadiusTiles: number,
): ChunkPoint[] {
  const shifted = {
    x: centre.x + ahead.x * CHUNK_PREFETCH_AHEAD_M,
    y: centre.y + ahead.y * CHUNK_PREFETCH_AHEAD_M,
  }
  const inView = new Set(
    visibleChunksAround(centre, viewRadius, planetRadiusTiles).map(({ cx, cy }) => `${cx},${cy}`),
  )
  return visibleChunksAround(shifted, viewRadius, planetRadiusTiles).filter(
    ({ cx, cy }) => !inView.has(`${cx},${cy}`),
  )
}
