/**
 * The kit sockets the local rig shows now (ticket 883), read from the authority replica at its
 * tick: the owned tools, each deployed while it acts, and the flask rack. The scene draws it and
 * the debug read reports it, the same function on the same state.
 */
import { readAuthorityState } from '../../../store/authorityLink'
import { useGameStore } from '../../../store/gameStore'
import { KIT_SOCKETS } from '../systems/kitSockets'
import { kitSocketsShownOf, type ShownKitSocket } from '../systems/render/kitSocketShows'

export function readKitSocketsShown(): ShownKitSocket[] {
  const state = readAuthorityState()
  return kitSocketsShownOf(state, useGameStore.getState().playerId, KIT_SOCKETS, state.tick)
}
