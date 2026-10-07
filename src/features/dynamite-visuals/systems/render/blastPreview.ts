/**
 * A blast to look at with no world change (#215 debug preview, presentation only): the rings K6
 * slices a blast of `radiusMm` into in solid rock, 64 tiles a tick nearest first, as the
 * `BlastFront` events it would announce, one a frame, after its detonation. The layer draws them
 * as it draws a real blast, so a browser spec measures the R24 front against its budget.
 */
import { BLAST_TILES_PER_TICK } from '../../../../constants/terrainBudget'
import { blastFrontOf, frontRadiusMm } from '../../../../systems/authority/charges/blastFront'
import type { DomainEvent } from '../../../../systems/authority/domainEvent'
import type { TilePoint } from '../../../../systems/world/tileGrid'

/** Each slice's ring from its first tile to its last, in mm from the charge tile's centre. */
export function solidRockSlicesOf(radiusMm: number): [number, number][] {
  const front = blastFrontOf(radiusMm)
  const slices: [number, number][] = []
  for (let first = 0; first < front.length; first += BLAST_TILES_PER_TICK) {
    const last = Math.min(front.length, first + BLAST_TILES_PER_TICK) - 1
    slices.push([frontRadiusMm(front[first].distanceSq), frontRadiusMm(front[last].distanceSq)])
  }
  return slices
}

/** The detonation, then one `BlastFront` per slice, each on its own frame. */
export function previewBlastFrames(at: TilePoint, size: number, radiusMm: number): DomainEvent[][] {
  const detonated: DomainEvent = {
    type: 'ChargeDetonated',
    tick: 0,
    ...at,
    size,
    radiusMm,
    by: 'fuse',
  }
  const fronts = solidRockSlicesOf(radiusMm).map(([rInnerMm, rOuterMm], slice): DomainEvent => ({
    type: 'BlastFront',
    tick: slice,
    ...at,
    rInnerMm,
    rOuterMm,
  }))
  return [[detonated], ...fronts.map((front) => [front])]
}
