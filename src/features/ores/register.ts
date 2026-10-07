/**
 * The ores slice's registration: no side effects at import; the loader calls `register`.
 *
 * The `oreTypes` provider (`systems/oreTypeProvider.ts`) and the rarity-lead generation hook
 * (`systems/leadRoll.ts`) are built and tested but not yet registered: a +2 lead in band 5 stores
 * tier offset 6, which the kernel's `resourceTierOf` still sends through `oreTier`'s band <= 6
 * assert, and the drill still reads an ore cell's hardness from its band, not its own tier (#140
 * "Cell storage", "Hardness"). Both are kernel edits outside this slice; see the #146 thread.
 */
import type { SliceDefinition } from '../../registries/sliceDefinition'
import { oresDebugActions } from './debug'

export const slice: SliceDefinition = {
  id: 'ores',
  register(r) {
    // steampunkDebug.features.ores.describe(), .typeOf(family, tier)
    r.debugActions(oresDebugActions)
  },
}
