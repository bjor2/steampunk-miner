/**
 * The slot keys (#162 section 2.3, G&V on #200): `use_slot_n` (Digit1-5, or a tap on the touch
 * column) uses what `powerup.n` holds at once. An empty slot, a locked one or an item no slot
 * press uses is a no-op: no command, so nothing to buffer or log. Whether the use is refused
 * (charges, cooldown, a gate) is the authority's answer, which is logged.
 */
import { vehicleOf } from '../../../systems/authority/authorityState'
import type { CommandIntent } from '../../../systems/authority/authorityCommand'
import type { InputReactionEntry } from '../../../systems/registries/inputReactions'
import type { InputSituation } from '../../../systems/input/inputRouting'
import './powerUpEvents'
import { actionOfSlot, POWER_UP_SLOTS, type PowerUpSlot } from './powerUpSlots'
import { pressablePowerUpOf } from './useRefusals'

export const SLOT_USE_REACTIONS: readonly InputReactionEntry[] = POWER_UP_SLOTS.map((slot) => ({
  id: `power-up-core.${actionOfSlot(slot)}`,
  actionId: actionOfSlot(slot),
  contexts: ['vehicle'],
  toIntent: (situation: InputSituation) => slotIntentOf(situation, slot),
}))

export function intentToUseSlot(slot: PowerUpSlot): CommandIntent {
  return { type: 'power-up-core.use_power_up', payload: { slot } }
}

function slotIntentOf(
  { state, playerId }: InputSituation,
  slot: PowerUpSlot,
): CommandIntent | null {
  return pressablePowerUpOf(vehicleOf(state, playerId), slot) === null
    ? null
    : intentToUseSlot(slot)
}
