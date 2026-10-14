/**
 * A `drillStep`'s cut at any speed (TD scope b on #316, ticket 335): the whole clear sweep every
 * tick, walked per cell while it fits the player's per-cell share (`cutShare.ts`) and as the swept
 * span per chunk once it goes over (`sweptSpanDrill.ts`, ticket 374). The two walks cut the same
 * bytes, so the budget never slows the cut or the motion that waits on it: motion stops only where
 * the sweep stops, at a gated or tip-locked cell.
 */
import { walkStampInRows } from '../world/groundEdit'
import type { PlanetParams } from '../world/planetParams'
import type { TilePoint } from '../world/tileGrid'
import { walkStampPerChunk } from '../world/sweptSpan'
import type { AuthorityState } from './authorityState'
import type { RuleEffect } from './commandRule'
import { isWithinShare } from './cutShare'
import { drillSweepBy, type ClearSweepWalk, type SweptStep } from './sweptDrill'

/** One `drillStep` tick of the swept cut at `state.tick`; call with a planet that has params. */
export function drillAlongStep(
  state: AuthorityState,
  params: PlanetParams,
  playerId: string,
  target: TilePoint,
  step: SweptStep,
): RuleEffect {
  return drillSweepBy(state, params, playerId, { target, step }, walkWithinShare).effect
}

/** The per-cell walk within the player's share, the span over it. */
export const walkWithinShare: ClearSweepWalk = ({ sweep, cells }) =>
  isWithinShare(cells, sweep.share) ? walkStampInRows : walkStampPerChunk
