/**
 * The sensing slice's registration (#203, data half in ticket 241): the echo sounder, threat
 * periscope, assay lens, hazard barometer, survey flare mortar and signal buoy as vehicle items
 * and power-ups, their `tech.sensing.*` nodes and their item cards. The galvanic probe and the
 * void sounder stay held (GD ruling on #203 Q3). No side effects at import; the loader calls
 * `register`.
 */
import type { SliceDefinition } from '../../registries/sliceDefinition'
import { SENSING_ITEM_CARDS } from './systems/itemCards'
import { SENSING_TECH_NODES, SENSING_VEHICLE_ITEMS } from './systems/sensingContent'
import { SENSING_POWER_UPS } from './systems/sensingPowerUps'

export const slice: SliceDefinition = {
  id: 'sensing',
  register(r) {
    r.content('vehicle-item', SENSING_VEHICLE_ITEMS)
    r.content('power-up', SENSING_POWER_UPS)
    r.content('tech-node', SENSING_TECH_NODES)
    r.itemDescriptionEntries(SENSING_ITEM_CARDS)
  },
}
