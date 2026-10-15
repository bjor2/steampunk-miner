/**
 * The effective travel speed accessor (GD lock on #316 scope 0 point 3, ticket 333): the one
 * function every effect that scales with the engine's top speed reads, so it keeps growing once
 * the drill sets travel (`vehicle/travelParity.ts`).
 */
import type { EngineStats } from '../economy/vehicleStats'
import { doesDrillSetTravel, travelEngineOf, travelSpeedOf } from '../vehicle/travelParity'
import { vehicleOf, type AuthorityState } from './authorityState'
import { planetParamsOf } from './planetOfState'

/** m/s: `max(speedMax, k * cutSpeed)` of the player's rig in the band it stands in. */
export function effectiveTravelSpeedOf(state: AuthorityState, playerId: string): number {
  return travelSpeedOf(vehicleOf(state, playerId), planetParamsOf(state.planet))
}

/** The rig's engine with the effective travel speed as its top speed, for the motion rule. */
export function travelEngineAt(state: AuthorityState, playerId: string): EngineStats {
  return travelEngineOf(vehicleOf(state, playerId), planetParamsOf(state.planet))
}

/** Whether the drill sets travel in every band of the planet: the engine track then reads maxed. */
export function isTravelSetByDrill(state: AuthorityState, playerId: string): boolean {
  return doesDrillSetTravel(vehicleOf(state, playerId), planetParamsOf(state.planet))
}
