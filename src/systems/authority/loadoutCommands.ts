/** The loadout's command intents (K4): play's `equipItem` and the scenario's loadout. */
import type { CommandIntent } from './authorityCommand'

/** `itemId` null empties the slot. */
export function equipItemCommand(slot: string, itemId: string | null): CommandIntent<'equipItem'> {
  return { type: 'equipItem', payload: { slot, itemId } }
}

export function setVehicleLoadoutCommand(
  slots: Readonly<Record<string, string>>,
  owned: readonly string[] = [],
): CommandIntent<'debug.setVehicleLoadout'> {
  return { type: 'debug.setVehicleLoadout', payload: { slots, owned } }
}
