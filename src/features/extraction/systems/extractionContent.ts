/**
 * The lane's shipped rows as the kernel and the slices take them (#201): the mineral drain's
 * `vehicle-item` row (the power-up slots, drawn at its slot's `hull.powerup.n`), its `power-up`
 * entry and its item card, and the lane's live tree nodes: the five extractor nodes and the
 * drain's.
 *
 * Held, unregistered (GD ruling on #201 Q1): the slurry siphon and its node. Its effect needs ore
 * in fluid ground, which no planet has; it is released by the spec that gives it that ground
 * (frozen planets), with its unlock moved to P17 or later, never P16.
 */
import type { ItemDescriptionEntry } from '../../../systems/registries/itemDescriptionEntries'
import type { VehicleItem } from '../../../systems/registries/vehicleLoadout'
import type { PowerUp } from '../../power-up-core'
import type { TechNode } from '../../tech-tree'
import { extractionItemOf, techNodeOf, vehicleItemOf, type ExtractionItem } from './extractionItems'
import { powerUpOfDrain } from './extractionPowerUps'
import { extractorNodes } from './extractorNodes'
import { itemCardOf } from './itemCards'

export const MINERAL_DRAIN = extractionItemOf('power.mineral_drain') as ExtractionItem

/** The items whose effect is built. */
export const SHIPPED_ITEMS: readonly ExtractionItem[] = [MINERAL_DRAIN]

export const EXTRACTION_VEHICLE_ITEMS: readonly VehicleItem[] = SHIPPED_ITEMS.map(vehicleItemOf)

export const EXTRACTION_POWER_UPS: readonly PowerUp[] = [powerUpOfDrain(MINERAL_DRAIN)]

export const EXTRACTION_ITEM_CARDS: readonly ItemDescriptionEntry[] = SHIPPED_ITEMS.map(itemCardOf)

/** Built when the slice registers: the extractor nodes read the family rows. */
export function extractionTechNodes(): TechNode[] {
  return [...extractorNodes(), ...SHIPPED_ITEMS.map(techNodeOf)]
}
