/**
 * The terrain-tools slice (#202, data half in ticket 240): the magnetic ore-shifter, the seam
 * splitter, the pressure pocket lance and the lodestone beacon as vehicle items and power-ups, their
 * `tech.terrain.*` nodes and item cards, the one-offs' sale at the Upgrade bay (ticket 248), and
 * their seeded edits on the K6 terrain-edit queue. The lodestone's live beacon waits in the
 * `terrain-tools` section and gathers at its owner's dock; combo item hooks hear it through the
 * kernel `liveBeacon` provider, and the shifter's drag consults the `dragTarget` hook (ticket 326).
 * The repulsor coil (ticket 284), the first terrain magnet with its effect, pushes cells through
 * the kernel's magnet shift and metal enemies one cell out, and logs `magnet_used`.
 * Stabiliser foam, the cryo binder, shoring props and the strata press stay vision rows
 * (`systems/shippedTools.ts`). No side effects at import; the loader calls `register`.
 */
import type { SliceDefinition } from '../../registries/sliceDefinition'
import { terrainToolsDebugActions } from './debug'
import { TERRAIN_PROJECTIONS, TERRAIN_RUN_EVENTS } from './logging'
import { LIVE_LODESTONE_PROVIDER, LODESTONE_DOCK_REACTION } from './systems/lodestoneBeacon'
import {
  TERRAIN_ITEM_CARDS,
  TERRAIN_TECH_NODES,
  TERRAIN_VEHICLE_ITEMS,
} from './systems/terrainContent'
import { TERRAIN_POWER_UPS } from './systems/terrainPowerUps'
import { TERRAIN_SELLER } from './systems/terrainSales'
import { TERRAIN_TOOLS_SECTION } from './systems/terrainSection'

export const slice: SliceDefinition = {
  id: 'terrain-tools',
  register(r) {
    r.content('vehicle-item', TERRAIN_VEHICLE_ITEMS)
    r.content('power-up', TERRAIN_POWER_UPS)
    r.content('tech-node', TERRAIN_TECH_NODES)
    r.itemDescriptionEntries(TERRAIN_ITEM_CARDS)
    r.vehicleItemSeller(TERRAIN_SELLER)
    r.saveSection(TERRAIN_TOOLS_SECTION)
    r.authorityReaction(LODESTONE_DOCK_REACTION)
    r.liveBeacon(LIVE_LODESTONE_PROVIDER)
    r.eventProjections(TERRAIN_PROJECTIONS)
    r.runEvents(TERRAIN_RUN_EVENTS)
    // steampunkDebug.features['terrain-tools'].getBeacon() / .statPreview(itemId, mark, planet)
    r.debugActions(terrainToolsDebugActions)
  },
}
