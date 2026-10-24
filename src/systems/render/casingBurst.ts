/**
 * The casing burst (CG2, ticket 830; the GD lock: "blinks red, then bursts, and the ground around
 * it collapses"): the moment a warned block's refill starts (`CollapseStarted`, #43 Sequence 2) its
 * ring bursts, sparks, a puff of cement dust and crack debris thrown from the block's centre
 * outward from the planet, through the kernel's spray pool. The refill itself is the kernel's
 * collapse (#43): the burst adds no ground change, no hardness, no damage and no cost. Pure: the
 * requests are written into reused scratch; the scene hands them to `requestSpray`.
 */
import { MM_PER_METRE } from '../../constants/physics'
import { CASING_BURST_SPRAYS } from '../../constants/scene'
import type { DomainEvent } from '../authority/domainEvent'
import { blockCentreMm, blockOfId } from '../world/collapseBlock'
import { SPRAY_KINDS, type SprayRequest } from './sprayPool'

/** Where a burst throws from: the block's centre, planet metres. */
export interface BurstPoint {
  x: number
  y: number
}

/** One request per spray kind, reused for every burst. */
export function createBurstScratch(): SprayRequest[] {
  return SPRAY_KINDS.map((kind) => ({
    kind,
    x: 0,
    y: 0,
    dirX: 0,
    dirY: 1,
    count: 0,
    priority: 'high' as const,
  }))
}

/** The centre of the block a `CollapseStarted` event names, or null for any other event. */
export function burstPointOf(event: DomainEvent): BurstPoint | null {
  if (event.type !== 'CollapseStarted') return null
  const block = blockOfId(event.block)
  if (block === null) return null
  const { xMm, yMm } = blockCentreMm(block)
  return { x: xMm / MM_PER_METRE, y: yMm / MM_PER_METRE }
}

/** Writes the burst's sprays from `point`, outward from the planet's centre, into `out`. */
export function writeBurstSprays(out: SprayRequest[], point: BurstPoint): SprayRequest[] {
  const length = Math.hypot(point.x, point.y)
  out.forEach((request) => {
    request.x = point.x
    request.y = point.y
    request.dirX = length === 0 ? 0 : point.x / length
    request.dirY = length === 0 ? 1 : point.y / length
    request.count = CASING_BURST_SPRAYS[request.kind]
    request.priority = 'high'
  })
  return out
}
