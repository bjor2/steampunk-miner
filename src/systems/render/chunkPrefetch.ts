/**
 * The chunks built ahead of the view, less the chunks already in it:
 *
 * 1. along the velocity (TD scope c1 on #316, ticket 336): every chunk the view passes over in
 *    the next `speed x lead` metres, in the order it reaches them, the reach never past the
 *    planet's diameter;
 * 2. then the view circle moved `CHUNK_PREFETCH_AHEAD_M` along the drill's facing (ticket 330),
 *    nearest first, so a rig standing still or starting to drill meets them built.
 */
import { CHUNK_PREFETCH_AHEAD_M } from '../../constants/scene'
import type { Vector2 } from '../vehicle/localFrame'
import { chunksAlongDriveLine, type DriveLine } from './driveLineChunks'
import { visibleChunksAround, type ChunkPoint } from './visibleChunks'

/** Where the rig is going, as the prefetch reads it. */
export interface DriveView {
  centre: Vector2
  viewRadius: number
  /** The rig's velocity, metres a second. */
  velocity: Vector2
  /** The drill's facing, a unit vector. */
  facing: Vector2
  /** How far ahead in time the drive line is built (`prefetchLeadSeconds`). */
  leadSeconds: number
  planetRadiusTiles: number
}

export function chunksAheadOf(drive: DriveView): ChunkPoint[] {
  const { centre, viewRadius, planetRadiusTiles } = drive
  const along = chunksAlongDriveLine(driveLineOf(drive), viewRadius, planetRadiusTiles)
  const facing = visibleChunksAround(facingCentreOf(drive), viewRadius, planetRadiusTiles)
  const inView = visibleChunksAround(centre, viewRadius, planetRadiusTiles)
  return chunksOutside([...along, ...facing], inView)
}

/** From the view's centre to where it will be after the lead, at most the planet's diameter. */
export function driveLineOf(drive: DriveView): DriveLine {
  const { centre, velocity, leadSeconds, planetRadiusTiles } = drive
  const speed = Math.hypot(velocity.x, velocity.y)
  const reach = Math.min(speed * leadSeconds, 2 * planetRadiusTiles)
  const scale = speed === 0 ? 0 : reach / speed
  return {
    from: centre,
    to: { x: centre.x + velocity.x * scale, y: centre.y + velocity.y * scale },
  }
}

function facingCentreOf({ centre, facing }: DriveView): Vector2 {
  return {
    x: centre.x + facing.x * CHUNK_PREFETCH_AHEAD_M,
    y: centre.y + facing.y * CHUNK_PREFETCH_AHEAD_M,
  }
}

/** `chunks` in their order, each once, without those in `inView`. */
function chunksOutside(chunks: readonly ChunkPoint[], inView: readonly ChunkPoint[]): ChunkPoint[] {
  const taken = new Set(inView.map(keyOf))
  return chunks.filter((chunk) => {
    const key = keyOf(chunk)
    if (taken.has(key)) return false
    taken.add(key)
    return true
  })
}

function keyOf({ cx, cy }: ChunkPoint): string {
  return `${cx},${cy}`
}
