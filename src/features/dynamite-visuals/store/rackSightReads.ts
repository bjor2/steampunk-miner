/**
 * What the dynamite rack shows from, as the local player's replica holds it now: the same rule
 * the rack piece draws and the debug read reports, so a spec reads what the car carries.
 */
import { readAuthorityState } from '../../../store/authorityLink'
import { useGameStore } from '../../../store/gameStore'
import { vehicleOf, type AuthorityState } from '../../../systems/authority/authorityState'
import { isDetonatorOpen } from '../../dynamite'
import { rackPartIdsOf, type RackSight } from '../systems/render/rackLook'

export function readRackSight(): RackSight {
  const state = readAuthorityState()
  return rackSightOf(state, useGameStore.getState().playerId)
}

/** The part ids the rack shows now. */
export function readRackPartIds(): string[] {
  return rackPartIdsOf(readRackSight())
}

function rackSightOf(state: AuthorityState, playerId: string): RackSight {
  return {
    isRackMounted: vehicleOf(state, playerId).charges.isRackMounted,
    planetIndex: state.planet.index,
    isDetonatorOpen: isDetonatorOpen(state),
  }
}
