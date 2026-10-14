/**
 * The drill-gear lane (#205, spec #162 sections 1 and 4; data half in ticket 242): the vibratory
 * bit, spoil auger, side cutters, thaw crown, twin-bit head (ticket 280), sampling corer, dielectric
 * bit (ticket 292) and reach boom as vehicle items in the drill sockets and as power-ups, their
 * `tech.drill_gear.*` nodes and item cards, and their effects: the bit's crumble as an authority
 * reaction, the cutters, boom and twin bit's diagonal on the kernel's drill gear read (the diagonal
 * cell logged by a reaction), the auger as a clock step, the corer as a charged act and the
 * dielectric bit as a shock shield. KeyF and KeyC press the flank and collar sockets, and the
 * Upgrade bay sells each item (ticket 248's seller). The lane's P16 fork (ticket 268) registers
 * its Wide and Deep branches, their cut on the same drill gear read and Wide's income rate. No
 * side effects at import; the loader calls `register`.
 */
import type { SliceDefinition } from '../../registries/sliceDefinition'
import { drillGearDebugActions } from './debug'
import { DRILL_GEAR_PROJECTIONS, DRILL_GEAR_RUN_EVENTS } from './logging'
import { CUTTERS_AND_BOOM_SOURCE } from './systems/cuttersAndBoom'
import { DRILL_GEAR_SECTION } from './systems/cuttersHold'
import { DIELECTRIC_BIT_SHIELD } from './systems/dielectricBit'
import {
  DRILL_GEAR_POWER_UPS,
  DRILL_GEAR_TECH_NODES,
  DRILL_GEAR_VEHICLE_ITEMS,
} from './systems/drillGearContent'
import { DRILL_GEAR_FORK_SOURCE } from './systems/drillGearFork'
import { DRILL_SOCKET_REACTIONS } from './systems/drillSocketKeys'
import { DRILL_GEAR_SELLER } from './systems/drillGearSales'
import { DRILL_GEAR_ITEM_CARDS } from './systems/itemCards'
import { SPOIL_AUGER_STEP } from './systems/spoilAuger'
import { DIAGONAL_CUT_REACTION, TWIN_BIT_SOURCE } from './systems/twinBit'
import { SOFT_GROUND_LINK_REACTION } from './systems/softGroundLink'
import { VIBRATORY_CRUMBLE_REACTION } from './systems/vibratoryCrumble'
import { WIDE_INCOME_RATE } from './systems/wideIncomeRate'

export const slice: SliceDefinition = {
  id: 'drill-gear',
  register(r) {
    r.content('vehicle-item', DRILL_GEAR_VEHICLE_ITEMS)
    r.content('power-up', DRILL_GEAR_POWER_UPS)
    r.content('tech-node', DRILL_GEAR_TECH_NODES)
    r.itemDescriptionEntries(DRILL_GEAR_ITEM_CARDS)
    r.vehicleItemSeller(DRILL_GEAR_SELLER)
    r.saveSection(DRILL_GEAR_SECTION)
    r.authorityReaction(VIBRATORY_CRUMBLE_REACTION)
    r.authorityReaction(SOFT_GROUND_LINK_REACTION)
    r.authorityReaction(DIAGONAL_CUT_REACTION)
    r.drillGear(CUTTERS_AND_BOOM_SOURCE)
    r.drillGear(TWIN_BIT_SOURCE)
    r.drillGear(DRILL_GEAR_FORK_SOURCE)
    r.incomeRate(WIDE_INCOME_RATE)
    r.shockShield(DIELECTRIC_BIT_SHIELD)
    r.clockStep(SPOIL_AUGER_STEP)
    DRILL_SOCKET_REACTIONS.forEach((reaction) => r.inputReaction(reaction))
    r.eventProjections(DRILL_GEAR_PROJECTIONS)
    r.runEvents(DRILL_GEAR_RUN_EVENTS)
    // steampunkDebug.features['drill-gear'].getEngaged() / .getTwinBit() / .getDielectricBit() /
    // .statPreview(itemId, mark, planet)
    r.debugActions(drillGearDebugActions)
  },
}
