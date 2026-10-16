/**
 * The ores slice's registration: no side effects at import; the loader calls `register`.
 *
 * The catalogue names every ore (`oreTypes`), the rarity lead lifts each patch's tier
 * (`generationHook`, which moves generated cells: GENERATOR_VERSION 7), the codex keeps a save's
 * kernel-named discoveries through the alias table, and the balance and session reports print the
 * sighting rows. The epic and mythic trip clamp prices every unit that reaches the hold
 * (`orePickup`, ticket 509), keeps its ledger in the `ores.rarity-trip` section and resets it at the
 * dock and on a rescue (protocol 82).
 */
import type { SliceDefinition } from '../../registries/sliceDefinition'
import { oresDebugActions } from './debug'
import { oreReportRows } from './oreReportRows'
import { kernelOreAliases } from './systems/kernelOreAliases'
import { oreLeadHook } from './systems/leadRoll'
import { oreTypeProvider } from './systems/oreTypeProvider'
import { RARITY_PICKUP_PROVIDER, RARITY_TRIP_RESET } from './systems/rarityPickup'
import { RARITY_TRIP_SECTION } from './systems/rarityTripSection'

export const slice: SliceDefinition = {
  id: 'ores',
  register(r) {
    r.oreTypes(oreTypeProvider)
    r.generationHook(oreLeadHook)
    r.discoveryAliases(kernelOreAliases())
    r.orePickup(RARITY_PICKUP_PROVIDER)
    r.saveSection(RARITY_TRIP_SECTION)
    r.authorityReaction(RARITY_TRIP_RESET)
    r.reportRows(oreReportRows)
    // steampunkDebug.features.ores.describe(), .typeOf(family, tier)
    r.debugActions(oresDebugActions)
  },
}
