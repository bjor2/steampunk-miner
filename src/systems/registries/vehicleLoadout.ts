/**
 * The vehicle's loadout slots (docs/standards/feature-slices.md 3.10, #162): the slot table, the
 * `vehicle-item` content kind and which slots accept an item. The loadout state, `equip_item` and
 * its refusals land with the loadout build (K4); item slices register acceptance here and never
 * import each other.
 */
import { contentOf, type ContentEntry } from './content'
import { defineRegistry, entriesOf } from './seal'
import type { AttachId } from './vehicleAttach'

export const LOADOUT_SLOT_IDS = [
  'powerup.1',
  'powerup.2',
  'powerup.3',
  'powerup.4',
  'powerup.5',
  'rig.1',
  'rig.2',
  'drill.head',
  'drill.flank',
  'drill.collar',
] as const

export type LoadoutSlotId = (typeof LOADOUT_SLOT_IDS)[number]

export type EquipRefusal =
  'not_owned' | 'slot_locked' | 'exclusive_taken' | 'not_docked' | 'wrong_slot'

export interface VehicleItem extends ContentEntry {
  slots: readonly LoadoutSlotId[]
  attach: AttachId | null
}

export interface LoadoutAcceptance {
  id: string
  itemId: string
  slots: readonly LoadoutSlotId[]
}

export const LOADOUT_ACCEPTANCE_REGISTRY = defineRegistry<LoadoutAcceptance>('vehicleLoadout')

/** The item's own slots and every slot an acceptance adds, in slot-table order. */
export function acceptedSlotsOf(itemId: string): readonly LoadoutSlotId[] {
  const accepted = new Set([...itemSlotsOf(itemId), ...acceptanceSlotsOf(itemId)])
  return LOADOUT_SLOT_IDS.filter((slot) => accepted.has(slot))
}

function itemSlotsOf(itemId: string): readonly LoadoutSlotId[] {
  return contentOf('vehicle-item').find((item) => item.id === itemId)?.slots ?? []
}

function acceptanceSlotsOf(itemId: string): LoadoutSlotId[] {
  return entriesOf(LOADOUT_ACCEPTANCE_REGISTRY)
    .filter((acceptance) => acceptance.itemId === itemId)
    .flatMap((acceptance) => acceptance.slots)
}
