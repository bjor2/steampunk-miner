/**
 * The drill-gear lane (#205, spec #162 sections 1 and 4; data half in ticket 242): the vibratory
 * bit, spoil auger, side cutters, thaw crown, sampling corer and reach boom as vehicle items in
 * the drill sockets and as power-ups, their `tech.drill_gear.*` nodes and item cards, and their
 * effects: the bit's crumble as an authority reaction, the cutters and boom on the kernel's drill
 * gear read, the auger as a clock step and the corer as a charged act. KeyF and KeyC press the
 * flank and collar sockets. The twin-bit head and the dielectric bit stay held back (GD lock, Q3).
 * No side effects at import; the loader calls `register`.
 */
import type { SliceDefinition } from '../../registries/sliceDefinition'
import { drillGearDebugActions } from './debug'
import { DRILL_GEAR_PROJECTIONS, DRILL_GEAR_RUN_EVENTS } from './logging'
import { CUTTERS_AND_BOOM_SOURCE } from './systems/cuttersAndBoom'
import {
  DRILL_GEAR_POWER_UPS,
  DRILL_GEAR_TECH_NODES,
  DRILL_GEAR_VEHICLE_ITEMS,
} from './systems/drillGearContent'
import { DRILL_SOCKET_REACTIONS } from './systems/drillSocketKeys'
import { DRILL_GEAR_ITEM_CARDS } from './systems/itemCards'
import { SPOIL_AUGER_STEP } from './systems/spoilAuger'
import { VIBRATORY_CRUMBLE_REACTION } from './systems/vibratoryCrumble'

export const slice: SliceDefinition = {
  id: 'drill-gear',
  register(r) {
    r.content('vehicle-item', DRILL_GEAR_VEHICLE_ITEMS)
    r.content('power-up', DRILL_GEAR_POWER_UPS)
    r.content('tech-node', DRILL_GEAR_TECH_NODES)
    r.itemDescriptionEntries(DRILL_GEAR_ITEM_CARDS)
    r.authorityReaction(VIBRATORY_CRUMBLE_REACTION)
    r.drillGear(CUTTERS_AND_BOOM_SOURCE)
    r.clockStep(SPOIL_AUGER_STEP)
    DRILL_SOCKET_REACTIONS.forEach((reaction) => r.inputReaction(reaction))
    r.eventProjections(DRILL_GEAR_PROJECTIONS)
    r.runEvents(DRILL_GEAR_RUN_EVENTS)
    // steampunkDebug.features['drill-gear'].getEngaged() / .statPreview(itemId, mark, planet)
    r.debugActions(drillGearDebugActions)
  },
}
