/**
 * The placed containers as the local player's replica holds them now, for the map markers, the
 * list and the debug read: the same function on the same state, so a spec reads what is drawn.
 * The drop (ticket 850) reads the crates the local player carries and sends their drop.
 */
import { readAuthorityState, submitCommand } from '../../../store/authorityLink'
import { useGameStore } from '../../../store/gameStore'
import { dropContainerIntent } from '../systems/containerRules'
import {
  containerMarkersOf,
  containerRowsOf,
  crateDropOf,
  type ContainerRow,
  type CrateDrop,
} from '../systems/containerViews'

export function readContainerRows(): ContainerRow[] {
  return containerRowsOf(readAuthorityState(), localPlayerId())
}

export function readContainerMarkers(): ContainerRow[] {
  return containerMarkersOf(readAuthorityState(), localPlayerId())
}

export function readCrateDrop(): CrateDrop | null {
  return crateDropOf(readAuthorityState(), localPlayerId())
}

/** The authority refuses, at no cost, a drop that cannot land: a greyed card's press does nothing. */
export function dropCarriedCrate(kind: string): void {
  submitCommand(localPlayerId(), dropContainerIntent(kind))
}

function localPlayerId(): string {
  return useGameStore.getState().playerId
}
