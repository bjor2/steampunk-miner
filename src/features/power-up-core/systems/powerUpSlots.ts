/**
 * The five power-up slots and the keys that press them (#162 sections 2.2 and 2.3): `use_slot_n`
 * presses `powerup.n`. Which slots are open and what they hold is the kernel's loadout.
 *
 * A press also reaches two drill sockets (the GD lock on #205 Q1 a): `drill.flank` and
 * `drill.collar` hold the drill gear a player flips or uses in the field. `drill.head` holds only
 * bits that are on while slotted, so no press reaches it. The drill-gear slice owns their keys.
 */
import type { LoadoutSlotId } from '../../../systems/registries/vehicleLoadout'
import {
  SLOT_ACTION_IDS,
  SOCKET_ACTION_IDS,
  type SlotActionId,
  type SlotTileActionId,
} from '../../../systems/input/touchControls'

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

export const DRILL_GEAR_SOCKETS = [
  'drill.flank',
  'drill.collar',
] as const satisfies readonly LoadoutSlotId[]

export type DrillGearSocket = (typeof DRILL_GEAR_SOCKETS)[number]

/** A slot `use_power_up` may press: a power-up slot or a drill socket that holds field gear. */
export type PressableSlot = PowerUpSlot | DrillGearSocket

/** Every pressable slot in the slot column's order: slots 1-5, then the flank and the collar. */
export const PRESSABLE_SLOTS: readonly PressableSlot[] = [...POWER_UP_SLOTS, ...DRILL_GEAR_SOCKETS]

export function isPressableSlot(slot: string): slot is PressableSlot {
  return PRESSABLE_SLOTS.includes(slot as PressableSlot)
}

/** `use_slot_n` for `powerup.n`. */
export function actionOfSlot(slot: PowerUpSlot): SlotActionId {
  return SLOT_ACTION_IDS[POWER_UP_SLOTS.indexOf(slot)]
}

/** What a tile presses: `use_slot_n`, or the socket's own key (KeyF, KeyC) for a drill socket. */
export function actionOfTile(slot: PressableSlot): SlotTileActionId {
  return isPowerUpSlot(slot)
    ? actionOfSlot(slot)
    : SOCKET_ACTION_IDS[DRILL_GEAR_SOCKETS.indexOf(slot)]
}
