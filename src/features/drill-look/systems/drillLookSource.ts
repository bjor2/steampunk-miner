/**
 * The drill look on the kernel vehicle (#554, through `vehicleLooks`, ticket 389): the look of the
 * stage the player's `drill_power` purchases have reached. Read-only on the state; no flash.
 */
import type { AuthorityState } from '../../../systems/authority/authorityState'
import type { VehicleLookSource } from '../../../systems/registries/vehicleLooks'
import { createDrillLooks, drillLookStageOf } from './render/drillLookSteps'

export const DRILL_LOOK_SOURCE_ID = 'drill-look.bit-glow'

export function createDrillLookSource(): VehicleLookSource {
  const looks = createDrillLooks()
  return {
    id: DRILL_LOOK_SOURCE_ID,
    lookOf: (state, playerId) => looks[drillLookStageOfPlayer(state, playerId)],
    flashOf: () => null,
  }
}

/** The stage `playerId`'s drill shows, 0 for a player not in the state. */
export function drillLookStageOfPlayer(state: AuthorityState, playerId: string): number {
  return drillLookStageOf(drillPurchasesOf(state, playerId))
}

function drillPurchasesOf(state: AuthorityState, playerId: string): number {
  return state.players[playerId]?.vehicle.levels.drill_power ?? 0
}
