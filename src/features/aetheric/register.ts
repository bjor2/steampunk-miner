/**
 * The aetheric slice's registration (GD lock on #245): the Aetheric science lane's P15, P24 and
 * P29 nodes as `tech-node` content (ticket 260), and the resonance whistle (#262): its
 * `vehicle-item` row and `power-up` entry, its item card and its sale at the Upgrade bay, the
 * `aetheric` section holding each player's sounding whistle, the lure the hunters' step hears
 * (`enemyLures`, ticket 361) and the clock that silences it, and the `whistle_sounded` line. The
 * governor and the condenser (#263) come with their own build. No side effects at import; the
 * loader calls `register`.
 */
import type { SliceDefinition } from '../../registries/sliceDefinition'
import { aethericDebugActions } from './debug'
import { AETHERIC_PROJECTIONS, AETHERIC_RUN_EVENTS } from './logging'
import {
  AETHERIC_ITEM_CARDS,
  AETHERIC_POWER_UPS,
  AETHERIC_VEHICLE_ITEMS,
} from './systems/aethericContent'
import { AETHERIC_TECH_NODES } from './systems/aethericNodes'
import { AETHERIC_SELLER } from './systems/aethericSales'
import { WHISTLE_LURE_CLOCK, WHISTLE_LURES } from './systems/whistleLures'
import { AETHERIC_SECTION } from './systems/whistleSection'

export const slice: SliceDefinition = {
  id: 'aetheric',
  register(r) {
    r.content('vehicle-item', AETHERIC_VEHICLE_ITEMS)
    r.content('power-up', AETHERIC_POWER_UPS)
    r.content('tech-node', AETHERIC_TECH_NODES)
    r.itemDescriptionEntries(AETHERIC_ITEM_CARDS)
    // The whistle on sale at the Upgrade bay once researched (ticket 248).
    r.vehicleItemSeller(AETHERIC_SELLER)
    r.saveSection(AETHERIC_SECTION)
    r.enemyLure(WHISTLE_LURES)
    r.clockStep(WHISTLE_LURE_CLOCK)
    r.eventProjections(AETHERIC_PROJECTIONS)
    r.runEvents(AETHERIC_RUN_EVENTS)
    // steampunkDebug.features.aetheric.getWhistle() / .statPreview(itemId, mark, planet)
    r.debugActions(aethericDebugActions)
  },
}
