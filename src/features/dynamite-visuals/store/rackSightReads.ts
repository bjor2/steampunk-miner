/**
 * What the dynamite rack shows from, as the local player's replica holds it now: the same rule
 * the rack piece draws and the debug read reports, so a spec reads what the car carries. The
 * Blast Radius level (#869) and the Blast Casing node (#862) are not yet on the vehicle: until
 * their tickets land, the rack reads level 0 and the node unowned, the shipped look.
 */
import { readAuthorityState } from '../../../store/authorityLink'
import { useGameStore } from '../../../store/gameStore'
import { vehicleOf, type AuthorityState } from '../../../systems/authority/authorityState'
import { UNOWNED_RADIUS_LEVEL } from '../../../systems/authority/charges/blastDisc'
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
  const { charges } = vehicleOf(state, playerId)
  return {
    isRackMounted: charges.isRackMounted,
    planetIndex: state.planet.index,
    isDetonatorOpen: isDetonatorOpen(state),
    carriedBySize: charges.carriedBySize,
    radiusLevel: UNOWNED_RADIUS_LEVEL,
    isBlastCasingOwned: false,
  }
}
