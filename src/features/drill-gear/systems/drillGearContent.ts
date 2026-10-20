/**
 * The lane's rows as the kernel, `power-up-core` and `tech-tree` take them (#205): one
 * `vehicle-item` (its one socket and attach point, #162 acceptance 1), one `power-up` and one
 * `tech-node` per shipped item: all eight since the dielectric bit's effect landed (ticket 292).
 * The lane's P16 fork adds its two branch nodes, which unlock no store item (ticket 268), and the
 * side cutters' width Mark 2 an owned item and its node, with no power-up (ticket 620).
 */
import type { VehicleItem } from '../../../systems/registries/vehicleLoadout'
import type { PowerUp } from '../../power-up-core'
import type { TechNode } from '../../tech-tree'
import { SHIPPED_DRILL_GEAR, techNodeOf, vehicleItemOf } from './drillGearItems'
import { DRILL_GEAR_FORK } from './drillGearFork'
import { powerUpOf } from './drillGearPowerUps'
import { SIDE_CUTTER_MARKS, techNodeOfMark, vehicleItemOfMark } from './sideCutterMarks'

export const DRILL_GEAR_VEHICLE_ITEMS: readonly VehicleItem[] = [
  ...SHIPPED_DRILL_GEAR.map(vehicleItemOf),
  ...SIDE_CUTTER_MARKS.map(vehicleItemOfMark),
]

export const DRILL_GEAR_POWER_UPS: readonly PowerUp[] = SHIPPED_DRILL_GEAR.map(powerUpOf)

export const DRILL_GEAR_TECH_NODES: readonly TechNode[] = [
  ...SHIPPED_DRILL_GEAR.map(techNodeOf),
  ...SIDE_CUTTER_MARKS.map(techNodeOfMark),
  ...DRILL_GEAR_FORK.branches,
]
