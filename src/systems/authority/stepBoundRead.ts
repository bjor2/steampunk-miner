/**
 * The stats-derived pose bound as the authority reads it (TD scope a on #316, ticket 334,
 * `vehicle/stepBound.ts`), from the rig's stats and the band of its reported pose, so the client
 * that reads the same state clamps its body to the same numbers.
 *
 * - A `drillStep` may be no further from the last accepted position than the bound of the cut gate
 *   the rig moved off it under (the cursor's, idled to that tick), plus the travelling bound for
 *   every later tick with no step of its own: travelling is never below cutting.
 * - A report's speed is checked against the travelling bound: it carries the body's speed from the
 *   tick before, which either gate may have set.
 * - The swept stamp's front sits `DRILL_STAMP_AHEAD_MM` plus the cutting bound ahead of the pose
 *   (TD scope 0), so a tick's cut always clears the step the rig may take next while it cuts.
 */
import { DRILL_STAMP_AHEAD_MM } from '../../constants/balance'
import { CLOSED_CUT_GATE, idledCutGate, isCutGateOpen, type CutGate } from '../vehicle/cutGate'
import { stepBoundMmOf, stepBoundsOf, type StepBounds } from '../vehicle/stepBound'
import type { SweptCut } from '../vehicle/sweptCut'
import { vehicleOf, type AuthorityState } from './authorityState'
import { planetParamsOf } from './planetOfState'

export function stepBoundsAt(state: AuthorityState, playerId: string): StepBounds {
  return stepBoundsOf(vehicleOf(state, playerId), planetParamsOf(state.planet))
}

/** How far a step may be from a position accepted `ticks` ticks before, left under `gate`. */
export function stepReachMmOf(bounds: StepBounds, gate: CutGate, ticks: number): number {
  const laterTicks = Math.max(0, ticks - 1)
  return stepBoundMmOf(bounds, isCutGateOpen(gate)) + laterTicks * bounds.travellingMm
}

/** The cut gate the cursor left the rig under at `tick`: its own, idled since; shut with none. */
export function cutGateLeftAt(cursor: SweptCut | undefined, tick: number): CutGate {
  if (cursor === undefined) return CLOSED_CUT_GATE
  return idledCutGate(cursor, Math.max(0, tick - cursor.tick))
}

/** How far ahead of the pose the swept stamp's centre sits: the report's, plus the cutting bound. */
export function sweptStampAheadMmAt(state: AuthorityState, playerId: string): number {
  return DRILL_STAMP_AHEAD_MM + stepBoundsAt(state, playerId).cuttingMm
}
