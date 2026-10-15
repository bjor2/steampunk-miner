/**
 * A `drillStep`'s cut at any speed (TD scope b on #316, ticket 335): the sweep as far as its work
 * reaches (the exact carry, ticket 399), walked per cell while it fits the player's per-cell share
 * (`cutShare.ts`) and in runs and as the swept span per chunk once it goes over
 * (`sweptSpanDrill.ts`, ticket 374). The walks cut the same bytes, so the budget never slows the
 * cut or the motion that waits on it: the work picks how far, the budget never does.
 *
 * It also generates the chunk one chunk ahead of the cut along the drive (TD scope b item 6), so
 * the tick the cut enters it does not pay its generation on top of the cut. Generation is pure and
 * only fills the planet's chunk cache: no state, no digest, no answer changes.
 */
import { MM_PER_METRE, UP_VECTOR_SCALE } from '../../constants/physics'
import { facingVectorOf, tileOfMillimetres, type VehiclePose } from '../vehicle/vehiclePose'
import { walkStampInRows } from '../world/groundEdit'
import type { PlanetParams } from '../world/planetParams'
import type { StampPoint } from '../world/stampShape'
import { CHUNK_SIZE, chunkOfTile, type TilePoint } from '../world/tileGrid'
import { walkStampPerChunk } from '../world/sweptSpan'
import { generatedChunkOf } from '../world/worldState'
import { vehicleOf, type AuthorityState } from './authorityState'
import type { RuleEffect } from './commandRule'
import { walkCarryInRuns, walkCarryPerCell } from '../vehicle/carryWalk'
import { isWithinShare } from './cutShare'
import { drillSweepBy, type SweepWalks, type SweptStep } from './sweptDrill'

/** One `drillStep` tick of the swept cut at `state.tick`; call with a planet that has params. */
export function drillAlongStep(
  state: AuthorityState,
  params: PlanetParams,
  playerId: string,
  target: TilePoint,
  step: SweptStep,
): RuleEffect {
  const effect = drillSweepBy(state, params, playerId, { target, step }, WITHIN_SHARE).effect
  prefetchChunkAhead(params, step.pose, vehicleOf(effect.state, playerId).sweptCut)
  return effect
}

/**
 * The per-cell walks within the player's share, runs and the span over it: the carry by the path's
 * sub-steps (an upper bound on the cells its centre crosses), the stamp by the cells it touches.
 */
export const WITHIN_SHARE: SweepWalks = {
  carryOf: ({ path, share }) =>
    isWithinShare(path.steps, share) ? walkCarryPerCell : walkCarryInRuns,
  stampOf: ({ sweep, cells }) =>
    isWithinShare(cells, sweep.share) ? walkStampInRows : walkStampPerChunk,
}

/** Generates the chunk a chunk's length ahead of where the cut reached, along the facing. */
function prefetchChunkAhead(
  params: PlanetParams,
  pose: VehiclePose,
  reached: StampPoint | undefined,
): void {
  const from = reached ?? { xMm: pose.x, yMm: pose.y }
  const ahead = facingVectorOf(pose.upx, pose.upy, pose.facing)
  const tile = tileOfMillimetres(
    from.xMm + chunkLengthOf(ahead.x),
    from.yMm + chunkLengthOf(ahead.y),
  )
  generatedChunkOf(params, chunkOfTile(tile.tx), chunkOfTile(tile.ty))
}

/** A 1024-scaled unit vector's component times one chunk's length, in whole mm. */
function chunkLengthOf(component: number): number {
  return Math.floor((component * CHUNK_SIZE * MM_PER_METRE) / UP_VECTOR_SCALE)
}
