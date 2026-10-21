/**
 * The slots on the tool slot bar (ticket 691; #474 moved them onto the touch panel first): one row
 * per pressable slot, slots 1-5 then the drill sockets (#244), at bar positions 1-7, so the
 * loadout's Fit order is the bar's order and Digit n presses cell n on desktop (Digit6 and Digit7
 * beside F and C for the sockets). Each is a tap of the slot's key, shown while the slot holds an
 * item a press can use; the whistle, the governor's powers, the grapple and the lode clamp all
 * reach the sim through these taps, a hold-used item held from finger-down to lift (ticket 332).
 */
import { defineToolSlotRow, type ToolSlotRow } from '../../../ui/registries/toolSlots'
import { slotButtonOf } from '../systems/slotColumn'
import { actionOfTile, PRESSABLE_SLOTS } from '../systems/powerUpSlots'
import { SlotToolCell } from './SlotToolCell'

export const SLOT_TOOL_SLOTS: readonly ToolSlotRow[] = PRESSABLE_SLOTS.map((slot, index) =>
  defineToolSlotRow({
    id: `power-up-core.${actionOfTile(slot)}`,
    anchor: { slot },
    touch: { gesture: 'tap', action: actionOfTile(slot) },
    position: index + 1,
    faceOf: (state, playerId) => slotButtonOf(state, playerId, slot),
    Cell: SlotToolCell,
  }),
)
