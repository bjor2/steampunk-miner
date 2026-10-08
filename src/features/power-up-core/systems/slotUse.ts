/**
 * The slot keys (#162 section 2.3, G&V on #200): `use_slot_n` (Digit1-5, or a tap on the touch
 * column) uses what `powerup.n` holds at once. An empty slot, a locked one or an item no slot
 * press uses is a no-op: no command, so nothing to buffer or log. Whether the use is refused
 * (charges, cooldown, a gate) is the authority's answer, which is logged.
 *
 * The key coming up sends `release_power_up` only while the slot holds an item used by holding
 * it (ticket 332); every other slot sends nothing on key-up, so its scripts and goldens see no
 * new command.
 */
import { vehicleOf } from '../../../systems/authority/authorityState'
import type { CommandIntent } from '../../../systems/authority/authorityCommand'
import type { InputReactionEntry } from '../../../systems/registries/inputReactions'
import type { InputSituation } from '../../../systems/input/inputRouting'
import './powerUpEvents'
import { actionOfSlot, POWER_UP_SLOTS, type PowerUpSlot, type PressableSlot } from './powerUpSlots'
import { isUsedByHolding } from './powerUpKind'
import { pressablePowerUpOf, slottedPowerUpOf } from './useRefusals'

export const SLOT_USE_REACTIONS: readonly InputReactionEntry[] = POWER_UP_SLOTS.map((slot) => ({
  id: `power-up-core.${actionOfSlot(slot)}`,
  actionId: actionOfSlot(slot),
  contexts: ['vehicle'],
  toIntent: (situation: InputSituation) => slotIntentOf(situation, slot),
  toReleaseIntent: (situation: InputSituation) => releaseIntentOf(situation, slot),
}))

export function intentToUseSlot(slot: PressableSlot): CommandIntent {
  return { type: 'power-up-core.use_power_up', payload: { slot } }
}

/** The slot let go (ticket 332): it ends the hold of an item used by holding it. */
export function intentToReleaseSlot(slot: PressableSlot): CommandIntent {
  return { type: 'power-up-core.release_power_up', payload: { slot } }
}

/**
 * The slot still held past the wind-up of the use it made (#256's hold milestone). No key sends it
 * yet: the slot's key-up sends only `release_power_up` (ticket 332), so the debug API's `holdSlot`
 * stands in for the held key.
 */
export function intentToHoldSlot(slot: PressableSlot): CommandIntent {
  return { type: 'power-up-core.hold_power_up', payload: { slot } }
}

function slotIntentOf(
  { state, playerId }: InputSituation,
  slot: PowerUpSlot,
): CommandIntent | null {
  return pressablePowerUpOf(vehicleOf(state, playerId), slot) === null
    ? null
    : intentToUseSlot(slot)
}

function releaseIntentOf(
  { state, playerId }: InputSituation,
  slot: PowerUpSlot,
): CommandIntent | null {
  const powerUp = slottedPowerUpOf(vehicleOf(state, playerId), slot)
  return powerUp !== null && isUsedByHolding(powerUp) ? intentToReleaseSlot(slot) : null
}
