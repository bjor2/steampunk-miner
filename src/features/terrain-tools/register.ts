/**
 * The terrain-tools slice (#202, data half in ticket 240): the magnetic ore-shifter, the seam
 * splitter, the pressure pocket lance and the lodestone beacon as vehicle items and power-ups, their
 * `tech.terrain.*` nodes and item cards, the one-offs' sale at the Upgrade bay (ticket 248), and
 * their seeded edits on the K6 terrain-edit queue. The lodestone's live beacon waits in the
 * `terrain-tools` section and gathers at its owner's dock; combo item hooks hear it through the
 * kernel `liveBeacon` provider, and the shifter's drag consults the `dragTarget` hook (ticket 326).
 * The repulsor coil (ticket 284), the first terrain magnet with its effect, pushes cells through
 * the kernel's magnet shift and metal enemies one cell out, and logs `magnet_used`. The lode clamp
 * (ticket 285) is held from its slot: its field braces the collapse blocks round the cells it pins
 * through the kernel's `collapseBraces` seam, draws the drill's rate a tick in its clock step, and
 * ends on release, at its length or on a dry tank. The three verbs' fields show as brass outlines
 * on a scene layer of their own (ticket 286): the beacon's converging arcs, the coil's ring and
 * flares, the clamp's lattice. With the Ore Lure twist held (ticket 329, through the kernel
 * `twist` hook), the shifter leaves a magnet plate in the section and drags toward it; the owner's
 * dock takes the plate back.
 * The ore-shifter, the pocket lance and the lodestone register their relocated ore value for the
 * kernel's 15% income-cap check (#385).
 * Stabiliser foam (ticket 381) sets on a forward cone and holds the collapse blocks under it for
 * 600 ticks through a timed `collapseBraces` provider of its own; its clock step drops each cell as
 * it lapses; researching its node owns it with a full stack, its only charge source (a reaction to
 * `TechNodeUnlocked`); its stack is bought back by the charge at the Upgrade bay through the
 * power-up core's restock (ticket 394), foam the lane's one `consumable-restock`. At the Mark that
 * masters foam its cells cure for good (ticket 368): a session
 * section of cured cells read by a `groundReinforcement` provider, billed at each cell's band, cut
 * cells and other planets dropped by a reaction. The cryo binder, shoring props and the strata press stay vision rows
 * (`systems/shippedTools.ts`). The lane's P16 fork (ticket 269), built on no magnet: the Bracer
 * props warning collapse blocks round its rig through the same `collapseBraces` seam, fed by a
 * reaction to `CollapseWarned`; the Breaker fractures the plain ground past each charge it blasts,
 * as a blast effect on the K6 queue. No side effects at import; the loader calls `register`.
 */
import type { SliceDefinition } from '../../registries/sliceDefinition'
import { terrainToolsDebugActions } from './debug'
import { TERRAIN_PROJECTIONS, TERRAIN_RUN_EVENTS } from './logging'
import { MAGNET_FIELD_LAYER_ID, MagnetFieldLayer } from './scene/MagnetFieldLayer'
import { BRACER_PROP_BRACES, BRACER_PROPS_REACTION } from './systems/bracerProps'
import { BREAKER_FRACTURE } from './systems/breakerFracture'
import { CURED_FOAM_REINFORCEMENT, CURED_FOAM_SECTION } from './systems/curedFoam'
import { CURED_FOAM_GROUND_REACTION } from './systems/foamCure'
import { FOAM_RESEARCH_REACTION } from './systems/foamResearch'
import { TERRAIN_RESTOCKS } from './systems/foamRestock'
import { LIVE_LODESTONE_PROVIDER, LODESTONE_DOCK_REACTION } from './systems/lodestoneBeacon'
import { HOLD_LODE_CLAMPS_STEP, LODE_CLAMP_BRACES } from './systems/lodeClamp'
import { TERRAIN_MAGNETS_SPEND_FAMILY } from './systems/magnetSpend'
import { MOVER_INCOME_RATES } from './systems/moverIncomeRates'
import { ORE_LURE_DOCK_REACTION } from './systems/oreLure'
import { MAGNET_FIELD_LAYER_BUDGET } from './systems/render/magnetFieldBudget'
import { LAPSE_FOAM_STEP, STABILISER_FOAM_BRACES } from './systems/stabiliserFoam'
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
    r.content('consumable-restock', TERRAIN_RESTOCKS)
    r.itemDescriptionEntries(TERRAIN_ITEM_CARDS)
    r.vehicleItemSeller(TERRAIN_SELLER)
    r.spendFamily(TERRAIN_MAGNETS_SPEND_FAMILY)
    MOVER_INCOME_RATES.forEach((rate) => r.incomeRate(rate))
    r.saveSection(TERRAIN_TOOLS_SECTION)
    r.authorityReaction(LODESTONE_DOCK_REACTION)
    r.authorityReaction(ORE_LURE_DOCK_REACTION)
    r.authorityReaction(BRACER_PROPS_REACTION)
    r.authorityReaction(FOAM_RESEARCH_REACTION)
    r.liveBeacon(LIVE_LODESTONE_PROVIDER)
    r.clockStep(HOLD_LODE_CLAMPS_STEP)
    r.collapseBrace(LODE_CLAMP_BRACES)
    r.collapseBrace(BRACER_PROP_BRACES)
    r.blastEffect(BREAKER_FRACTURE)
    r.clockStep(LAPSE_FOAM_STEP)
    r.collapseBrace(STABILISER_FOAM_BRACES)
    r.saveSection(CURED_FOAM_SECTION)
    r.reinforcement(CURED_FOAM_REINFORCEMENT)
    r.authorityReaction(CURED_FOAM_GROUND_REACTION)
    r.sceneLayer({
      id: MAGNET_FIELD_LAYER_ID,
      Layer: MagnetFieldLayer,
      budget: MAGNET_FIELD_LAYER_BUDGET,
    })
    r.eventProjections(TERRAIN_PROJECTIONS)
    r.runEvents(TERRAIN_RUN_EVENTS)
    // steampunkDebug.features['terrain-tools'].getBeacon() / .getClampLattice() / .getFoam()
    //   / .statPreview(itemId, mark, planet) / .getMagnetFields()
    r.debugActions(terrainToolsDebugActions)
  },
}
