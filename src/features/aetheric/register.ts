/**
 * The aetheric slice's registration (GD lock on #245): the Aetheric science lane's P15, P24 and
 * P29 nodes as `tech-node` content (ticket 260) and their items, each a `vehicle-item` row, a
 * `power-up` entry, an item card and a sale at the Upgrade bay:
 *
 * - the resonance whistle (#262): the `aetheric` section holding each player's sounding whistle,
 *   the lure the hunters' step hears (`enemyLures`, ticket 361) and the clock that silences it;
 * - the chronometric governor (#263): the `aetheric.pocket` section holding each player's slow
 *   pocket, the slow every enemy's step hears (`enemyStepModifiers`, ticket 375) and the clock that
 *   pays for and closes it;
 * - the aether condenser (#263), burning the `aetheric.heat` section's off-act item heat gauge
 *   (the GD ruling on #263 Q1 a), drawn on the HUD while its items are owned.
 *
 * The P16 fork pair (#261) comes with its own build. No side effects at import; the loader calls
 * `register`.
 */
import type { SliceDefinition } from '../../registries/sliceDefinition'
import { aethericDebugActions } from './debug'
import { AETHERIC_PROJECTIONS, AETHERIC_RUN_EVENTS } from './logging'
import { AETHERIC_RULES } from './systems/aethericCommands'
import {
  AETHERIC_ITEM_CARDS,
  AETHERIC_POWER_UPS,
  AETHERIC_VEHICLE_ITEMS,
} from './systems/aethericContent'
import { AETHERIC_TECH_NODES } from './systems/aethericNodes'
import { AETHERIC_SELLER } from './systems/aethericSales'
import { GOVERNOR_SLOW, POCKET_CLOCK } from './systems/governorPockets'
import { ITEM_HEAT_SECTION } from './systems/itemHeat'
import { POCKET_SECTION } from './systems/pocketSection'
import { WHISTLE_LURE_CLOCK, WHISTLE_LURES } from './systems/whistleLures'
import { AETHERIC_SECTION } from './systems/whistleSection'
import { ItemHeatGauge } from './ui/ItemHeatGauge'

export const slice: SliceDefinition = {
  id: 'aetheric',
  register(r) {
    r.content('vehicle-item', AETHERIC_VEHICLE_ITEMS)
    r.content('power-up', AETHERIC_POWER_UPS)
    r.content('tech-node', AETHERIC_TECH_NODES)
    r.itemDescriptionEntries(AETHERIC_ITEM_CARDS)
    // The lane's items on sale at the Upgrade bay once researched (ticket 248).
    r.vehicleItemSeller(AETHERIC_SELLER)
    r.saveSection(AETHERIC_SECTION)
    r.saveSection(POCKET_SECTION)
    r.saveSection(ITEM_HEAT_SECTION)
    r.enemyLure(WHISTLE_LURES)
    r.enemyStepModifier(GOVERNOR_SLOW)
    r.clockStep(WHISTLE_LURE_CLOCK)
    r.clockStep(POCKET_CLOCK)
    r.commandRules(AETHERIC_RULES)
    r.hudPanel({ id: 'aetheric.item-heat', slot: 'gauges', Panel: ItemHeatGauge })
    r.eventProjections(AETHERIC_PROJECTIONS)
    r.runEvents(AETHERIC_RUN_EVENTS)
    // steampunkDebug.features.aetheric.getWhistle() / .getPocket() / .getItemHeat() /
    // .statPreview(itemId, mark, planet)
    r.debugActions(aethericDebugActions)
  },
}
