/**
 * The ores slice's registration: no side effects at import; the loader calls `register`.
 *
 * The catalogue names every ore (`oreTypes`), the rarity lead lifts each patch's tier
 * (`generationHook`, which moves generated cells: GENERATOR_VERSION 7), the codex keeps a save's
 * kernel-named discoveries through the alias table, and the balance and session reports print the
 * sighting rows. The epic and mythic trip clamp prices every unit that reaches the hold
 * (`orePickup`, ticket 509), keeps its ledger in the `ores.rarity-trip` section and resets it at the
 * dock and on a rescue (protocol 82). The planet registry's rows are the kernel's one `planetRow`
 * provider (ticket 707): world generation reads each planet's radius (ticket 643), menus its display
 * name (ticket 702) and the renderer its look (ticket 653). They also give the hazard pockets of
 * planets 2 to 5 (`hazardPockets`, ticket 652), and the planet card reads planets 2 to 5 their
 * hazard's tag and arrival line (`planetCardLine`, ticket 654).
 */
import type { SliceDefinition } from '../../registries/sliceDefinition'
import { oresDebugActions } from './debug'
import { oreReportRows } from './oreReportRows'
import { kernelOreAliases } from './systems/kernelOreAliases'
import { HAZARD_CARD_SOURCE } from './systems/hazardCardSource'
import { HAZARD_POCKETS_PROVIDER } from './systems/hazardPockets'
import { oreLeadHook } from './systems/leadRoll'
import { PLANET_ROW_PROVIDER } from './systems/planetRowProvider'
import { oreTypeProvider } from './systems/oreTypeProvider'
import { RARITY_PICKUP_PROVIDER, RARITY_TRIP_RESET } from './systems/rarityPickup'
import { RARITY_TRIP_SECTION } from './systems/rarityTripSection'

export const slice: SliceDefinition = {
  id: 'ores',
  register(r) {
    r.oreTypes(oreTypeProvider)
    r.generationHook(oreLeadHook)
    r.planetRow(PLANET_ROW_PROVIDER)
    r.hazardPockets(HAZARD_POCKETS_PROVIDER)
    r.planetCardLine(HAZARD_CARD_SOURCE)
    r.discoveryAliases(kernelOreAliases())
    r.orePickup(RARITY_PICKUP_PROVIDER)
    r.saveSection(RARITY_TRIP_SECTION)
    r.authorityReaction(RARITY_TRIP_RESET)
    r.reportRows(oreReportRows)
    // steampunkDebug.features.ores.describe(), .typeOf(family, tier)
    r.debugActions(oresDebugActions)
  },
}
