/**
 * The item refs of the kernel's own buyables (K7 #199): one name per thing bought, shared by
 * `listBuyableRefs` and the screens that draw its card, so a describer answers the ref the
 * coverage list walks. Ids are the kernel's existing ones where it has them (upgrade ids, lining
 * schedule rows, artefact option ids, bay ids).
 */
import type { UpgradeId } from '../economy/economyDefinition'
import { liningRowIdOf } from '../vehicle/liningType'
import type { BayId } from '../world/dockBays'
import type { ItemKind, ItemRef } from './itemDescriber'

export const KERNEL_ITEMS = {
  repair: itemRefOf('service', 'repair'),
  recharge: itemRefOf('service', 'recharge'),
  quickService: itemRefOf('service', 'quick_service'),
  refine: itemRefOf('service', 'refine'),
  travel: itemRefOf('service', 'travel'),
  casing: itemRefOf('module', 'casing'),
  guns: itemRefOf('module', 'guns'),
  charges: itemRefOf('module', 'charges'),
  chargeRack: itemRefOf('module', 'charge_rack'),
  refinerySlot: itemRefOf('module', 'refinery_slot'),
} as const satisfies Readonly<Record<string, ItemRef>>

export function trackItemOf(upgradeId: UpgradeId): ItemRef {
  return itemRefOf('track', upgradeId)
}

export function liningItemOf(liningType: string): ItemRef {
  return itemRefOf('module', liningRowIdOf(liningType))
}

export function artefactItemOf(optionId: string): ItemRef {
  return itemRefOf('artefact', optionId)
}

/** A tech-unlocked vehicle item as the Upgrade bay sells it (ticket 248). */
export function vehicleItemRefOf(itemId: string): ItemRef {
  return itemRefOf('vehicle-item', itemId)
}

export function bayItemOf(bay: BayId): ItemRef {
  return itemRefOf('bay', bay)
}

function itemRefOf(kind: ItemKind, id: string): ItemRef {
  return { kind, id }
}
