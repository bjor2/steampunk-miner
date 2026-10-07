/**
 * The loadout's command intents (K4): play's `equipItem` and the scenario's loadout, and the
 * Upgrade bay's `buyVehicleItem` that makes an item owned (ticket 248).
 */
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

/** The Upgrade bay buys a tech-unlocked vehicle item (ticket 248). */
export function buyVehicleItemCommand(itemId: string): CommandIntent<'buyVehicleItem'> {
  return { type: 'buyVehicleItem', payload: { itemId } }
}
