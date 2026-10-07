/**
 * The lane's rows as the kernel and `tech-tree` take them: one `vehicle-item` per item (slot
 * acceptance and one attach point, #162 acceptance 1) and one `tech-node` per row, the third
 * cradle's included. Base items are horizontal, the cradle both (#162 "Labels").
 */
import type { VehicleItem } from '../../../systems/registries/vehicleLoadout'
import { POWER_UP_SLOTS } from '../../power-up-core'
import type { TechNode } from '../../tech-tree'
import { MOBILITY_ITEM_ROWS, MOBILITY_ROWS, type MobilityRow } from './mobilityCatalogue'
import { markLadderOf } from './markLadders'

export const MOBILITY_VEHICLE_ITEMS: readonly VehicleItem[] = MOBILITY_ITEM_ROWS.map(vehicleItemOf)

export const MOBILITY_TECH_NODES: readonly TechNode[] = MOBILITY_ROWS.map(techNodeOf)

function vehicleItemOf(row: MobilityRow): VehicleItem {
  return { id: row.itemId, iconId: row.iconId, slots: POWER_UP_SLOTS, attach: row.attach }
}

function techNodeOf(row: MobilityRow): TechNode {
  const ladder = markLadderOf(row.itemId)
  const isCradle = ladder === null
  return {
    id: `tech.mobility.${row.node}`,
    iconId: row.iconId,
    lane: 'mobility',
    name: row.name,
    unlockTier: row.unlockTier,
    prereqs: row.prereqs.map((name) => `tech.mobility.${name}`),
    ...(row.requiresOwned !== undefined && { requiresOwned: row.requiresOwned }),
    unlocks: row.itemId,
    description: row.flavour,
    label: isCradle ? 'both' : 'horizontal',
    costKind: isCradle ? 'slot' : 'capability',
    ...(row.scheduleRowId !== undefined && { scheduleRowId: row.scheduleRowId }),
    ...(ladder !== null && { marks: ladder }),
  }
}
