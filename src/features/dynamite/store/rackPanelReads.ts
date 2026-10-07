/**
 * The rack panel as the local player's replica holds it now, for the HUD panel and the debug read:
 * the same function on the same state, so a spec reads what the panel draws.
 */
import { readAuthorityState } from '../../../store/authorityLink'
import { useGameStore } from '../../../store/gameStore'
import { rackPanelOf, type RackPanel } from '../systems/rackPanel'

export function readRackPanel(): RackPanel | null {
  const game = useGameStore.getState()
  return rackPanelOf({
    state: readAuthorityState(),
    playerId: game.playerId,
    chosenSize: game.chosenChargeSize,
    bindings: game.bindings,
  })
}
