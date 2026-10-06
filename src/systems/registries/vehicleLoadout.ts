/**
 * The vehicle's loadout slots (docs/standards/feature-slices.md 3.10, #162): the slot table, the
 * `vehicle-item` content kind and which slots accept an item. Item slices register acceptance here
 * and never import each other; the loadout state and `equip_item` are `vehicle/loadoutState.ts`
 * and `authority/loadoutRules.ts` (K4).
 *
 * No `rig.*` slots (Game Director ruling on #162, 6 Oct): extractors are mounted once owned, so
 * `equip_item` covers power-ups and drill gear only.
 */
import { contentOf, type ContentEntry } from './content'
import { defineRegistry, entriesOf } from './seal'
import type { ItemAttach } from './vehicleAttach'

export const LOADOUT_SLOT_IDS = [
  'powerup.1',
  'powerup.2',
  'powerup.3',
  'powerup.4',
  'powerup.5',
  'drill.head',
  'drill.flank',
  'drill.collar',
] as const

export type LoadoutSlotId = (typeof LOADOUT_SLOT_IDS)[number]

/** Open on a new vehicle (#162 TD lock): two power-up slots and the drill sockets. */
const SLOTS_OPEN_AT_START: readonly LoadoutSlotId[] = [
  'powerup.1',
  'powerup.2',
  'drill.head',
  'drill.flank',
  'drill.collar',
]

/** Capacity 1 and exclusive (#162 TD lock): a second item is refused, never swapped in. */
const EXCLUSIVE_SLOTS: readonly LoadoutSlotId[] = ['drill.head', 'drill.collar']

export type EquipRefusal =
  'not_owned' | 'slot_locked' | 'exclusive_taken' | 'not_docked' | 'wrong_slot'

export interface VehicleItem extends ContentEntry {
  slots: readonly LoadoutSlotId[]
  attach: ItemAttach | null
  /** A power-up cradle (#162 `slot.powerup_3`-`5`): owning it opens this slot. */
  opensSlot?: LoadoutSlotId
}

export interface LoadoutAcceptance {
  id: string
  itemId: string
  slots: readonly LoadoutSlotId[]
}

export const LOADOUT_ACCEPTANCE_REGISTRY = defineRegistry<LoadoutAcceptance>('vehicleLoadout')

export function isLoadoutSlotId(value: unknown): value is LoadoutSlotId {
  return LOADOUT_SLOT_IDS.includes(value as LoadoutSlotId)
}

export function isSlotOpenAtStart(slot: LoadoutSlotId): boolean {
  return SLOTS_OPEN_AT_START.includes(slot)
}

export function isExclusiveSlot(slot: LoadoutSlotId): boolean {
  return EXCLUSIVE_SLOTS.includes(slot)
}

/** The item's own slots and every slot an acceptance adds, in slot-table order. */
export function acceptedSlotsOf(itemId: string): readonly LoadoutSlotId[] {
  const accepted = new Set([...itemSlotsOf(itemId), ...acceptanceSlotsOf(itemId)])
  return LOADOUT_SLOT_IDS.filter((slot) => accepted.has(slot))
}

export function isVehicleItemId(itemId: string): boolean {
  return vehicleItemOf(itemId) !== undefined
}

/** The slot a cradle item opens once owned, or null for every other item. */
export function slotOpenedBy(itemId: string): LoadoutSlotId | null {
  return vehicleItemOf(itemId)?.opensSlot ?? null
}

function vehicleItemOf(itemId: string): VehicleItem | undefined {
  return contentOf('vehicle-item').find((item) => item.id === itemId)
}

function itemSlotsOf(itemId: string): readonly LoadoutSlotId[] {
  return vehicleItemOf(itemId)?.slots ?? []
}

function acceptanceSlotsOf(itemId: string): LoadoutSlotId[] {
  return entriesOf(LOADOUT_ACCEPTANCE_REGISTRY)
    .filter((acceptance) => acceptance.itemId === itemId)
    .flatMap((acceptance) => acceptance.slots)
}
