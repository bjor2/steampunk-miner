/**
 * The merchant panel as the local player's replica holds it now, for that player: for the Sell
 * bay's panel and the debug read, the same function on the same state, so a spec reads what is
 * drawn. Buy sends the merchant line's command for the local player.
 */
import { readAuthorityState, submitCommand } from '../../../store/authorityLink'
import { useGameStore } from '../../../store/gameStore'
import { buyKitItemIntent } from '../systems/kitBuyRules'
import { merchantPanelOf, type MerchantPanelView } from '../systems/merchantPanel'
import { PLANET_KITS } from '../systems/planetKitRows'

export function readMerchantPanel(): MerchantPanelView | null {
  return merchantPanelOf(PLANET_KITS, readAuthorityState(), useGameStore.getState().playerId)
}

/** The authority refuses, at no cost, what cannot be bought: a locked line's press changes nothing. */
export function buyFromMerchant(itemId: string): void {
  submitCommand(useGameStore.getState().playerId, buyKitItemIntent(itemId))
}
