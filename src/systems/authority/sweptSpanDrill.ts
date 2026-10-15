/**
 * The swept span per chunk (ticket 374, the TD lock on #374 after 6050644115 on #316): one tick of
 * the swept cut carved as one pass over its span (`world/sweptSpan.ts`) as far as its work
 * reaches, the carry walked in runs (ticket 399).
 *
 * - **The per-cell walk is the source of truth.** The span shares every rule with
 *   `drillAlongSweep` but the stamp's walk, which visits the same samples in the same order, and
 *   the carry's runs, which pay what its per-cell walk pays, so the two answer the same state and
 *   events byte for byte (`sweptSpanDrill.test.ts` at 18 and 100 m/s).
 * - **Stops** only where the walk stops (`isStopCell` in `sweptCarry.ts`): a cell whose gated drill
 *   time is null, a gated or tip-locked one, checked on every cell the stamp's centre crosses. A
 *   later stopping hazard stops it by answering null there. Core, a full hold, lava and electrified
 *   cells act as on the walk, cell by cell in crossing order, through the one drill path.
 * - **Energy** is the walk's, through the one drill path.
 * - **Forced-span test mode**: specs call `drillAlongSpan` where they call `drillAlongSweep` for
 *   the per-cell walk. `drillStep` switches between the two by the per-cell budget
 *   (`drillStepCut.ts`, ticket 335).
 * - It answers the tick's `drill_cut` tally (`drillCutTally.ts`) and writes no run-log line.
 */
import { walkStampPerChunk } from '../world/sweptSpan'
import type { PlanetParams } from '../world/planetParams'
import type { TilePoint } from '../world/tileGrid'
import type { AuthorityState } from './authorityState'
import type { RuleEffect } from './commandRule'
import { drillCutTallyOf, type DrillCutTally } from './drillCutTally'
import { walkCarryInRuns } from '../vehicle/carryWalk'
import { drillSweepBy, type SweepWalks, type SweptStep } from './sweptDrill'

/** A span tick's effect and its `drill_cut` tally. */
export interface SpanCut {
  effect: RuleEffect
  tally: DrillCutTally
}

/** One tick of the swept cut at `state.tick` as a span; call with a planet that has params. */
export function drillAlongSpan(
  state: AuthorityState,
  params: PlanetParams,
  playerId: string,
  target: TilePoint,
  step: SweptStep,
): SpanCut {
  const outcome = drillSweepBy(state, params, playerId, { target, step }, AS_SPAN)
  return { effect: outcome.effect, tally: drillCutTallyOf(state, params, playerId, outcome) }
}

/** The carry in runs and the span per chunk, whatever the cells. */
export const AS_SPAN: SweepWalks = {
  carryOf: () => walkCarryInRuns,
  stampOf: () => walkStampPerChunk,
}
