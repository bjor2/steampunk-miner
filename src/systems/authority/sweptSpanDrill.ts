/**
 * The swept span per chunk (ticket 374, the TD lock on #374 after 6050644115 on #316): one tick of
 * the swept cut carved as one pass over its span (`world/sweptSpan.ts`) up to the furthest
 * sub-step its gates leave clear, with no per-cell terrain budget.
 *
 * - **The per-cell walk is the source of truth.** The span shares every rule with
 *   `drillAlongSweep` but the stamp's walk, which visits the same samples in the same order, so
 *   wherever that walk's terrain budget does not bind the two answer the same state and events
 *   byte for byte (`sweptSpanDrill.test.ts` at 18 and 100 m/s).
 * - **Stops** only where the walk stops (`isStopCell` in `sweptDrill.ts`): a cell whose gated drill
 *   time is null, a gated or tip-locked one, checked on every cell the stamp's centre crosses. A
 *   later stopping hazard stops it by answering null there. Core, a full hold, lava and electrified
 *   cells act as on the walk, cell by cell in crossing order, through the one drill path.
 * - **Energy** is the walk's: the ticks used, so a swept tick charges at most 4 quanta.
 * - **Forced-span test mode**: specs call `drillAlongSpan` where `drillStep` calls
 *   `drillAlongSweep`. No live switch ships here; #335 owns it (a tick over the ~32-cell per-cell
 *   budget runs the span).
 * - It answers the tick's `drill_cut` tally (`drillCutTally.ts`) and writes no run-log line.
 */
import { walkStampPerChunk } from '../world/sweptSpan'
import type { PlanetParams } from '../world/planetParams'
import type { TilePoint } from '../world/tileGrid'
import type { AuthorityState } from './authorityState'
import type { RuleEffect } from './commandRule'
import { drillCutTallyOf, type DrillCutTally } from './drillCutTally'
import { carveStampWithRead, drillGearReadAt } from './drillGearCut'
import { bitAt, drillSweepBy, type ClearSweep, type SweptCarve, type SweptStep } from './sweptDrill'

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
  const outcome = drillSweepBy(state, params, playerId, { target, step }, carveSpanToClear)
  return { effect: outcome.effect, tally: drillCutTallyOf(state, params, playerId, outcome) }
}

/** The whole clear sweep, its stamp walked per chunk. */
function carveSpanToClear(
  state: AuthorityState,
  params: PlanetParams,
  playerId: string,
  { sweep, request, clear }: ClearSweep,
): SweptCarve {
  const bit = bitAt(sweep, clear)
  const read = drillGearReadAt(state, params, playerId, bit, request.gates)
  const carved = carveStampWithRead(params, bit, read, request, walkStampPerChunk)
  return { ...carved, reachedStep: clear }
}
