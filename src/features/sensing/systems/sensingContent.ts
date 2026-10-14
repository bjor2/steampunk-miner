/**
 * The sensing rows the slice registers (#203, the GD ruling on its Q3): every #162 sensing item
 * but the galvanic probe and the void sounder, as `vehicle-item` rows and `tech.sensing.*` nodes.
 * The two held rows stay unregistered and unseen until their planets exist: the probe at P25 or
 * later after #258's kernel `hazard:magnetic` build, the void sounder at P33 or later after the
 * hollow-planet spec. The void sounder's prereq is the probe, so holding one holds both. The
 * lane's P16 fork, Scout and Diviner, joins the nodes (ticket 269); its branches are researched
 * passives, so they add no vehicle item.
 */
import type { VehicleItem } from '../../../systems/registries/vehicleLoadout'
import type { TechNode } from '../../tech-tree'
import { SENSING_ITEMS, type SensingItem } from './sensingCatalogue'
import { FIFTH_CRADLE_NODE } from './sensingCradle'
import { SENSING_FORK } from './sensingFork'
import { techNodeOf, vehicleItemOf } from './sensingItems'

/** Held by the GD ruling on #203 Q3; no marker of theirs draws either (TD guard). */
export const HELD_SENSING_ITEM_IDS: readonly string[] = [
  'power.galvanic_probe',
  'power.void_sounder',
]

export const SHIPPED_SENSING_ITEMS: readonly SensingItem[] = SENSING_ITEMS.filter(isShipped)

export const SENSING_VEHICLE_ITEMS: readonly VehicleItem[] =
  SHIPPED_SENSING_ITEMS.map(vehicleItemOf)

/** The items' nodes, the fifth cradle's (ticket 251) and the fork's two branches (ticket 269). */
export const SENSING_TECH_NODES: readonly TechNode[] = [
  ...SHIPPED_SENSING_ITEMS.map(techNodeOf),
  FIFTH_CRADLE_NODE,
  ...SENSING_FORK.branches,
]

function isShipped(item: SensingItem): boolean {
  return !HELD_SENSING_ITEM_IDS.includes(item.itemId)
}
