/**
 * The placed containers as the local player's replica holds them now, for the map markers, the
 * list and the debug read: the same function on the same state, so a spec reads what is drawn.
 */
import { readAuthorityState } from '../../../store/authorityLink'
import { useGameStore } from '../../../store/gameStore'
import { containerMarkersOf, containerRowsOf, type ContainerRow } from '../systems/containerViews'

export function readContainerRows(): ContainerRow[] {
  return containerRowsOf(readAuthorityState(), useGameStore.getState().playerId)
}

export function readContainerMarkers(): ContainerRow[] {
  return containerMarkersOf(readAuthorityState(), useGameStore.getState().playerId)
}
