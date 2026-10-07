/**
 * The slot column as the local player's replica holds it now, for the touch panel and the debug
 * reads: the same function on the same state, so a spec reads what the column draws.
 */
import { readAuthorityState } from '../../../store/authorityLink'
import { useGameStore } from '../../../store/gameStore'
import { itemCardOf, type ItemCardModel } from '../../../systems/views/itemCardModel'
import { slotButtonsOf, type SlotButton } from '../systems/slotColumn'
import { intentToUseSlot } from '../systems/slotUse'

export function readSlotButtons(): SlotButton[] {
  return slotButtonsOf(readAuthorityState(), useGameStore.getState().playerId)
}

/** The #164 card a held slot shows: the slotted item, priced at nothing, its action the use. */
export function readSlotCard(button: SlotButton): ItemCardModel {
  return itemCardOf(readAuthorityState(), useGameStore.getState().playerId, {
    item: { kind: 'vehicle-item', id: button.itemId },
    iconId: button.iconId,
    name: button.name,
    cost: null,
    level: 0,
    buy: {
      id: button.slot,
      label: button.name,
      action: { kind: 'submit', intent: intentToUseSlot(button.slot) },
      reason: null,
    },
  })
}
