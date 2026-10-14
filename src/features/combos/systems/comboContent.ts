/**
 * The combos that ship, as the kernel and the tree take them (GD lock on #206): each one's
 * `vehicle-item` row, its authored grade-1 node where it has one (P15-P28), and its pair's
 * template, from which the tree grades it on from P41. The held rows (`comboHolds.ts`) stay
 * vision rows.
 */
import type { VehicleItem } from '../../../systems/registries/vehicleLoadout'
import type { TechComboTemplate, TechNode } from '../../tech-tree'
import { COMBO_ITEMS, type ComboItem } from './comboCatalogue'
import { isShippedCombo } from './comboHolds'
import { authoredComboNodesOf, COMBO_TEMPLATES, vehicleItemOf } from './comboRows'

export const SHIPPED_COMBOS: readonly ComboItem[] = COMBO_ITEMS.filter((item) =>
  isShippedCombo(item.itemId),
)

export const COMBO_VEHICLE_ITEMS: readonly VehicleItem[] = SHIPPED_COMBOS.map(vehicleItemOf)

export const COMBO_TECH_NODES: readonly TechNode[] = authoredComboNodesOf(SHIPPED_COMBOS)

export const SHIPPED_COMBO_TEMPLATES: readonly TechComboTemplate[] = COMBO_TEMPLATES.filter(
  (template) => isShippedCombo(template.unlocks),
)
