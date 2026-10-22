/**
 * The effective travel speed accessor (GD lock on #316 scope 0 point 3, ticket 333): the one
 * function every effect that scales with the rig's top speed reads. Since Bjor's ruling on #723 it
 * is the drive's speed, the engine's top speed alone (`vehicle/cutCapSpeed.ts`): buying drill
 * speed never changes it.
 */
import type { EngineStats } from '../economy/vehicleStats'
import { driveSpeedOf } from '../vehicle/cutCapSpeed'
import { statsOfVehicle } from '../vehicle/vehicleState'
import { vehicleOf, type AuthorityState } from './authorityState'

/** m/s: the drive's speed, the engine's `speedMax`, of the player's rig. */
export function effectiveTravelSpeedOf(state: AuthorityState, playerId: string): number {
  return driveSpeedOf(vehicleOf(state, playerId))
}

/** The rig's engine as the motion rule drives on it. */
export function travelEngineAt(state: AuthorityState, playerId: string): EngineStats {
  return statsOfVehicle(vehicleOf(state, playerId)).engine
}
