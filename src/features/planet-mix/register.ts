/**
 * The planet-mix slice's registration: no side effects at import; the loader calls `register`.
 *
 * The mix fold gives each ore patch from P3 the family of its tier and carves the signature out of
 * its own tier's patches (`generationHook`, which moves generated cells: GENERATOR_VERSION 8); the
 * signature tag flags each planet's signature ore so it sells one tier up and is drill-gated
 * (`oreSignature`, #232); the balance and session reports print each planet's theme and sightings.
 * P1 and P2 generate as before.
 */
import type { SliceDefinition } from '../../registries/sliceDefinition'
import { planetMixDebugActions } from './debug'
import { planetMixReportRows } from './mixReportRows'
import { isPatchNearLava, planetMixHookOf } from './systems/mixRoll'
import { planetMixSignatureTag } from './systems/signatureTag'

export const slice: SliceDefinition = {
  id: 'planet-mix',
  register(r) {
    r.generationHook(planetMixHookOf(isPatchNearLava))
    r.oreSignature(planetMixSignatureTag)
    r.reportRows(planetMixReportRows)
    // steampunkDebug.features['planet-mix'].describe(), .mixOf(p, seed), .histogramOf(p, seeds)
    r.debugActions(planetMixDebugActions)
  },
}
