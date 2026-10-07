/**
 * The five power-up slots and the keys that press them (#162 sections 2.2 and 2.3): `use_slot_n`
 * presses `powerup.n`. Which slots are open and what they hold is the kernel's loadout.
 */
import type { LoadoutSlotId } from '../../../systems/registries/vehicleLoadout'
import { SLOT_ACTION_IDS, type SlotActionId } from '../../../systems/input/touchControls'

export const POWER_UP_SLOTS = [
  'powerup.1',
  'powerup.2',
  'powerup.3',
  'powerup.4',
  'powerup.5',
] as const satisfies readonly LoadoutSlotId[]

export type PowerUpSlot = (typeof POWER_UP_SLOTS)[number]

export function isPowerUpSlot(slot: string): slot is PowerUpSlot {
  return POWER_UP_SLOTS.includes(slot as PowerUpSlot)
}

/** `use_slot_n` for `powerup.n`. */
export function actionOfSlot(slot: PowerUpSlot): SlotActionId {
  return SLOT_ACTION_IDS[POWER_UP_SLOTS.indexOf(slot)]
}
