/**
 * The planet-mix slice's registration: no side effects at import; the loader calls `register`.
 *
 * Only the read-only debug actions for now. The mix fold (`planetMixHookOf`) is built and tested but
 * not registered: signature cells need the kernel seams asked for on #147 (an ore's signature flag,
 * its +1 sale tier and the lava-pocket query), so generation stays byte-identical until they land.
 */
import type { SliceDefinition } from '../../registries/sliceDefinition'
import { planetMixDebugActions } from './debug'

export const slice: SliceDefinition = {
  id: 'planet-mix',
  register(r) {
    // steampunkDebug.features['planet-mix'].describe(), .mixOf(planetIndex, worldSeed)
    r.debugActions(planetMixDebugActions)
  },
}
