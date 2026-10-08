/**
 * The lane's rows as the kernel, `power-up-core` and `tech-tree` take them (#205): one
 * `vehicle-item` (its one socket and attach point, #162 acceptance 1), one `power-up` and one
 * `tech-node` per shipped item: all eight since the dielectric bit's effect landed (ticket 292).
 */
import type { VehicleItem } from '../../../systems/registries/vehicleLoadout'
import type { PowerUp } from '../../power-up-core'
import type { TechNode } from '../../tech-tree'
import { SHIPPED_DRILL_GEAR, techNodeOf, vehicleItemOf } from './drillGearItems'
import { powerUpOf } from './drillGearPowerUps'

export const DRILL_GEAR_VEHICLE_ITEMS: readonly VehicleItem[] =
  SHIPPED_DRILL_GEAR.map(vehicleItemOf)

export const DRILL_GEAR_POWER_UPS: readonly PowerUp[] = SHIPPED_DRILL_GEAR.map(powerUpOf)

export const DRILL_GEAR_TECH_NODES: readonly TechNode[] = SHIPPED_DRILL_GEAR.map(techNodeOf)
