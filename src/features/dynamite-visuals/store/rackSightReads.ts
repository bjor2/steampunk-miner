/**
 * What the dynamite rack shows from, as the local player's replica holds it now: the same rule
 * the rack piece draws and the debug read reports, so a spec reads what the car carries. Its
 * sticks grow with the Blast Radius level the rig owns (D9 #869). The Blast Casing node (#862) is
 * not yet on the vehicle: until it lands, the rack reads the node unowned, the shipped look.
 */
import { readAuthorityState } from '../../../store/authorityLink'
import { useGameStore } from '../../../store/gameStore'
import { vehicleOf, type AuthorityState } from '../../../systems/authority/authorityState'
import { blastRadiusLevelOf } from '../../../systems/vehicle/vehicleCharges'
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
    carriedBySize: charges.carriedBySize,
    radiusLevel: blastRadiusLevelOf(charges),
    isBlastCasingOwned: false,
  }
}
