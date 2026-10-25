/**
 * A blast to look at with no world change (#215 debug preview, presentation only): the rings K6
 * slices a blast of `radiusMm` into in solid rock, 64 tiles a tick nearest first, as the
 * `BlastFront` events it would announce, one a frame, after its detonation. The layer draws them
 * as it draws a real blast, so a browser spec measures the R24 front against its budget. The
 * `showcase` variant buys the size first (a `ChargesRestocked` the feed's ledger hears), so the
 * blast plays as the size's first after its first purchase (D8, ticket 868); a `radiusLevel`
 * widens the detonation's ground radius as the disc rule does, for the explosion bench rows.
 */
import { MM_PER_METRE } from '../../../../constants/physics'
import { BLAST_TILES_PER_TICK } from '../../../../constants/terrainBudget'
import {
  baseR2Of,
  baseTilesSqOf,
  groundR2Of,
  UNOWNED_RADIUS_LEVEL,
} from '../../../../systems/authority/charges/blastDisc'
import { blastFrontOf, frontRadiusMm } from '../../../../systems/authority/charges/blastFront'
import type { DomainEvent } from '../../../../systems/authority/domainEvent'
import { chargeTypeOf } from '../../../../systems/economy/chargeSizes'
import type { TilePoint } from '../../../../systems/world/tileGrid'

const HALF_TILE_MM = MM_PER_METRE / 2

/** Each slice's ring from its first tile to its last, in mm from the charge tile's centre. */
export function solidRockSlicesOf(radiusMm: number): [number, number][] {
  const front = blastFrontOf(baseTilesSqOf(radiusMm))
  const slices: [number, number][] = []
  for (let first = 0; first < front.length; first += BLAST_TILES_PER_TICK) {
    const last = Math.min(front.length, first + BLAST_TILES_PER_TICK) - 1
    slices.push([frontRadiusMm(front[first].distanceSq), frontRadiusMm(front[last].distanceSq)])
  }
  return slices
}

/**
 * The detonation with its disc record (so the marks layer leaves the size's crater, D7 #866),
 * then one `BlastFront` per slice, each on its own frame.
 */
export type PreviewVariant = 'plain' | 'showcase'

export function isPreviewVariant(value: unknown): value is PreviewVariant {
  return value === 'plain' || value === 'showcase'
}

/** The ground radius a Blast Radius level widens the rung's to, mm: 500·2L_i·√(1 + L/16). */
export function widenedRadiusMmOf(radiusMm: number, radiusLevel: number): number {
  const groundR2 = groundR2Of({ radiusMm, radiusLevel })
  return Math.round(Math.sqrt(Number(groundR2) / 16) * HALF_TILE_MM)
}

export function previewBlastFrames(
  at: TilePoint,
  size: number,
  radiusMm: number,
  variant: PreviewVariant = 'plain',
  radiusLevel: number = UNOWNED_RADIUS_LEVEL,
): DomainEvent[][] {
  const bought: DomainEvent[] =
    variant === 'showcase'
      ? [{ type: 'ChargesRestocked', tick: 0, size, count: 1, price: '0' }]
      : []
  const detonated: DomainEvent = {
    type: 'ChargeDetonated',
    tick: 0,
    ...at,
    size,
    radiusMm: widenedRadiusMmOf(radiusMm, radiusLevel),
    by: 'fuse',
  }
  const started: DomainEvent = {
    type: 'BlastStarted',
    tick: 0,
    ...at,
    size,
    chargeType: chargeTypeOf(size),
    radiusLevel,
    baseR2: String(baseR2Of({ radiusMm, radiusLevel })),
    groundR2: String(groundR2Of({ radiusMm, radiusLevel })),
    blastSeq: 0,
    casingLaid: false,
  }
  const fronts = solidRockSlicesOf(radiusMm).map(([rInnerMm, rOuterMm], slice): DomainEvent => ({
    type: 'BlastFront',
    tick: slice,
    ...at,
    rInnerMm,
    rOuterMm,
  }))
  return [[...bought, detonated, started], ...fronts.map((front) => [front])]
}
