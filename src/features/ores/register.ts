/**
 * The ores slice's registration: no side effects at import; the loader calls `register`.
 *
 * The catalogue names every ore (`oreTypes`), the rarity lead lifts each patch's tier
 * (`generationHook`, which moves generated cells: GENERATOR_VERSION 7), the codex keeps a save's
 * kernel-named discoveries through the alias table, and the balance and session reports print the
 * sighting rows.
 */
import type { SliceDefinition } from '../../registries/sliceDefinition'
import { oresDebugActions } from './debug'
import { oreReportRows } from './oreReportRows'
import { kernelOreAliases } from './systems/kernelOreAliases'
import { oreLeadHook } from './systems/leadRoll'
import { oreTypeProvider } from './systems/oreTypeProvider'

export const slice: SliceDefinition = {
  id: 'ores',
  register(r) {
    r.oreTypes(oreTypeProvider)
    r.generationHook(oreLeadHook)
    r.discoveryAliases(kernelOreAliases())
    r.reportRows(oreReportRows)
    // steampunkDebug.features.ores.describe(), .typeOf(family, tier)
    r.debugActions(oresDebugActions)
  },
}
