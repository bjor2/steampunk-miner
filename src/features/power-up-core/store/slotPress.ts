/**
 * A finger on a slot tile (ticket 332, the GD call on #285). An item used by holding its slot is
 * pressed on finger-down and let go on the lift or a slide-off, however long the finger was down;
 * every other tile waits for the lift to tell a tap from the long press that opens the item card
 * (#217). A press that started its item's use never opens the card; one the authority refused
 * (cooling down, out of charges) still may, after the long press.
 */
import { readAuthorityState } from '../../../store/authorityLink'
import { useGameStore } from '../../../store/gameStore'
import { holdSlotButton, pressSlotButton } from '../../../store/touchRuntime'
import type { SlotButton } from '../systems/slotColumn'
import { isSlotInUse } from '../systems/slotRelease'

export interface SlotTilePress {
  /** Whether a long press of this press may still open the item card. */
  mayShowCard: boolean
}

export function pressSlotTile(button: SlotButton, atMs: number): SlotTilePress {
  if (!button.isUsedByHolding) return waitForTap(button, atMs)
  holdSlotButton(button.action)
  return { mayShowCard: !isSlotInUse(readAuthorityState(), localPlayerId(), button.slot) }
}

function waitForTap(button: SlotButton, atMs: number): SlotTilePress {
  pressSlotButton(button.action, atMs)
  return { mayShowCard: true }
}

function localPlayerId(): string {
  return useGameStore.getState().playerId
}
