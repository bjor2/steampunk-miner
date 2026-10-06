/**
 * What the vehicle carries (#162 TD lock, K4): the item in each loadout slot and the vehicle items
 * the player owns. Ownership lives here, in the kernel, because purchases are kernel economy state
 * (#155, TD call 4); extractors take effect whenever they are owned, with no slot. An empty
 * `drill.head` is the stock bit.
 *
 * Plain JSON with item ids as strings, so the snapshot and the digest are exact. `owned` is kept
 * sorted, so the same items always digest the same.
 */
import {
  isExclusiveSlot,
  isSlotOpenAtStart,
  LOADOUT_SLOT_IDS,
  slotOpenedBy,
  type LoadoutSlotId,
} from '../registries/vehicleLoadout'

export type LoadoutSlots = Readonly<Record<LoadoutSlotId, string | null>>

export interface VehicleLoadout {
  slots: LoadoutSlots
  /** Sorted, each id once. */
  owned: readonly string[]
}

export const EMPTY_LOADOUT: VehicleLoadout = {
  slots: Object.fromEntries(LOADOUT_SLOT_IDS.map((slot) => [slot, null])) as LoadoutSlots,
  owned: [],
}

export function isItemOwned(loadout: VehicleLoadout, itemId: string): boolean {
  return loadout.owned.includes(itemId)
}

export function itemInSlot(loadout: VehicleLoadout, slot: LoadoutSlotId): string | null {
  return loadout.slots[slot]
}

/** Open from the start, or opened by an owned power-up cradle (#162: P10, P20 and P30 nodes). */
export function isSlotOpen(loadout: VehicleLoadout, slot: LoadoutSlotId): boolean {
  return isSlotOpenAtStart(slot) || loadout.owned.some((itemId) => slotOpenedBy(itemId) === slot)
}

/** An exclusive slot holding another item: it must be emptied first (#162 `exclusive_taken`). */
export function isExclusiveSlotTaken(
  loadout: VehicleLoadout,
  slot: LoadoutSlotId,
  itemId: string,
): boolean {
  const held = itemInSlot(loadout, slot)
  return isExclusiveSlot(slot) && held !== null && held !== itemId
}

/** The slot holding `itemId` now, if any: an item is one part, so it sits in one slot at most. */
export function slotHoldingItem(loadout: VehicleLoadout, itemId: string): LoadoutSlotId | null {
  return LOADOUT_SLOT_IDS.find((slot) => loadout.slots[slot] === itemId) ?? null
}

export function withSlotItem(
  loadout: VehicleLoadout,
  slot: LoadoutSlotId,
  itemId: string | null,
): VehicleLoadout {
  return { ...loadout, slots: { ...loadout.slots, [slot]: itemId } }
}

export function withItemsOwned(
  loadout: VehicleLoadout,
  itemIds: readonly string[],
): VehicleLoadout {
  const owned = [...new Set([...loadout.owned, ...itemIds])].sort(compareIds)
  return { ...loadout, owned }
}

function compareIds(a: string, b: string): number {
  return a === b ? 0 : a < b ? -1 : 1
}
