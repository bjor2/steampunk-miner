/**
 * The lane's shipped rows as the kernel and the slices take them (#201): the mineral drain's
 * `vehicle-item` row (the power-up slots, drawn at its slot's `hull.powerup.n`), its `power-up`
 * entry and its item card.
 *
 * Held back as vision rows: the slurry siphon, whose effect needs ore in fluid ground that the
 * world does not have yet, and the `tech.extraction.*` nodes, whose first prerequisite (the
 * Resonance Fork's node) no slice registers. Both wait on the planner (#201).
 */
import type { ItemDescriptionEntry } from '../../../systems/registries/itemDescriptionEntries'
import type { VehicleItem } from '../../../systems/registries/vehicleLoadout'
import type { PowerUp } from '../../power-up-core'
import { extractionItemOf, vehicleItemOf, type ExtractionItem } from './extractionItems'
import { powerUpOfDrain } from './extractionPowerUps'
import { itemCardOf } from './itemCards'

export const MINERAL_DRAIN = extractionItemOf('power.mineral_drain') as ExtractionItem

/** The items whose effect is built. */
export const SHIPPED_ITEMS: readonly ExtractionItem[] = [MINERAL_DRAIN]

export const EXTRACTION_VEHICLE_ITEMS: readonly VehicleItem[] = SHIPPED_ITEMS.map(vehicleItemOf)

export const EXTRACTION_POWER_UPS: readonly PowerUp[] = [powerUpOfDrain(MINERAL_DRAIN)]

export const EXTRACTION_ITEM_CARDS: readonly ItemDescriptionEntry[] = SHIPPED_ITEMS.map(itemCardOf)
