/**
 * The `heatPause` seam (ticket 233, the GD lock on #204 Q2): a slice's heat sink vents the gauge
 * and pauses heat gain for a window it keeps in its own section, so the effect replays and
 * stays the same for every player. The kernel lays every registered window over each span the
 * gauge settles (`heatPauseSteps.ts`), never below the heat-sink floor in `itemEffectCaps`. With
 * nothing registered the gauge settles as it did.
 */
import type { AuthorityState } from '../authority/authorityState'
import { ECONOMY } from '../economy/economy'
import { pausedHeatSteps, type HeatPauseWindow } from '../vehicle/heatPauseSteps'
import type { HeatSegment, HeatStep } from '../vehicle/vehicleHeat'
import { defineRegistry, entriesOf } from './seal'

export type { HeatPauseWindow } from '../vehicle/heatPauseSteps'

export interface HeatPause {
  id: string
  /** The player's windows, past ones included until the gauge has settled past them. */
  pausesOf(state: AuthorityState, playerId: string): readonly HeatPauseWindow[]
}

export const HEAT_PAUSE_REGISTRY = defineRegistry<HeatPause>('heatPauses')

/** The span from `startTick` with every registered window's vent and pause laid in. */
export function heatStepsWithPauses(
  state: AuthorityState,
  playerId: string,
  startTick: number,
  segments: readonly HeatSegment[],
): readonly HeatStep[] {
  const windows = entriesOf(HEAT_PAUSE_REGISTRY).flatMap((pause) => pause.pausesOf(state, playerId))
  return pausedHeatSteps(segments, startTick, windows, ECONOMY.itemEffectCaps.heatFloorBp)
}
