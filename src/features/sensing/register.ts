/**
 * The sensing slice's registration (#203, data half in ticket 241): the echo sounder, threat
 * periscope, assay lens, hazard barometer, survey flare mortar and signal buoy as vehicle items
 * and power-ups, their `tech.sensing.*` nodes, their item cards and the one-offs' sale at the
 * Upgrade bay (ticket 248); the reveal layer that draws pings, flare maps and buoy pins; the
 * periscope's arrows in the threats slot and the lens's and barometer's overlay cards. Render-only:
 * no section, no command, no log line of its own. The passives' Mark 3 sibling-links (#256) fire
 * at their own moments, a clock step and two reactions that hand power-up-core the moment. The
 * galvanic probe and the void sounder stay held (GD ruling on #203 Q3). The lane's P16 fork
 * (ticket 269): the Scout's wide vague pings fill the board on their own clock, the Diviner's
 * cone reads with each cut and warns on its own overlay chip. No side effects at import; the
 * loader calls `register`.
 */
import type { SliceDefinition } from '../../registries/sliceDefinition'
import { sensingDebugActions } from './debug'
import { REVEAL_LAYER_ID, RevealMarkLayer } from './scene/RevealMarkLayer'
import { SENSING_ITEM_CARDS } from './systems/itemCards'
import {
  BAROMETER_LINK_REACTION,
  LENS_LINK_REACTION,
  PERISCOPE_LINK_STEP,
} from './systems/passiveLinks'
import { REVEAL_LAYER_BUDGET } from './systems/revealBudget'
import { SENSING_TECH_NODES, SENSING_VEHICLE_ITEMS } from './systems/sensingContent'
import { SENSING_POWER_UPS } from './systems/sensingPowerUps'
import { SENSING_SELLER } from './systems/sensingSales'
import { AssayCards } from './ui/AssayCards'
import { BarometerChip } from './ui/BarometerChip'
import { DivinerChip } from './ui/DivinerChip'
import { PeriscopeArrows } from './ui/PeriscopeArrows'

/** A hazard ahead outranks the mining chips (10); the lens's cards give way to them. */
const BAROMETER_OVERLAY_PRIORITY = 20
const LENS_OVERLAY_PRIORITY = 5
/** The Diviner's warning sits just under the barometer's: both warn of what lies ahead. */
const DIVINER_OVERLAY_PRIORITY = 19

export const slice: SliceDefinition = {
  id: 'sensing',
  register(r) {
    r.content('vehicle-item', SENSING_VEHICLE_ITEMS)
    r.content('power-up', SENSING_POWER_UPS)
    r.content('tech-node', SENSING_TECH_NODES)
    r.itemDescriptionEntries(SENSING_ITEM_CARDS)
    r.vehicleItemSeller(SENSING_SELLER)
    r.clockStep(PERISCOPE_LINK_STEP)
    r.authorityReaction(LENS_LINK_REACTION)
    r.authorityReaction(BAROMETER_LINK_REACTION)
    r.sceneLayer({ id: REVEAL_LAYER_ID, Layer: RevealMarkLayer, budget: REVEAL_LAYER_BUDGET })
    r.hudPanel({ id: 'sensing.periscope', slot: 'threats', Panel: PeriscopeArrows })
    r.hudPanel({
      id: 'sensing.barometer',
      slot: 'overlay',
      priority: BAROMETER_OVERLAY_PRIORITY,
      Panel: BarometerChip,
    })
    r.hudPanel({
      id: 'sensing.diviner',
      slot: 'overlay',
      priority: DIVINER_OVERLAY_PRIORITY,
      Panel: DivinerChip,
    })
    r.hudPanel({
      id: 'sensing.lens',
      slot: 'overlay',
      priority: LENS_OVERLAY_PRIORITY,
      Panel: AssayCards,
    })
    // steampunkDebug.features.sensing.getReveals() / .statPreview(itemId, mark, planet)
    r.debugActions(sensingDebugActions)
  },
}
