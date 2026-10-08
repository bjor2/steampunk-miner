/**
 * The planet-mix slice's registration: no side effects at import; the loader calls `register`.
 *
 * The mix fold gives each ore patch from P3 the family of its tier and carves the signature out of
 * its own tier's patches (`generationHook`, which moves generated cells: GENERATOR_VERSION 8); the
 * signature tag flags each planet's signature ore so it sells one tier up and is drill-gated
 * (`oreSignature`, #232); the balance and session reports print each planet's theme and sightings.
 * The kernel's `hazard:magnetic` reads the magnetic planets' fields and electrified cells from here
 * (`magneticGround`, ticket 290). A magnetic planet shows itself (ticket 293): the aurora on the
 * kernel's planet sky band, the field lines as a scene layer and their Blender asset; the arcs on
 * electrified cells ride the kernel's terrain channel through `magneticGround`. P1 and P2 generate
 * as before.
 */
import type { SliceDefinition } from '../../registries/sliceDefinition'
import { planetMixDebugActions } from './debug'
import { planetMixReportRows } from './mixReportRows'
import { FIELD_ARC_LAYER_ID, FieldArcLayer } from './scene/FieldArcLayer'
import { isElectrifiedCell } from './systems/electrifiedCells'
import { magneticFieldAt } from './systems/magneticFields'
import { isPatchNearLava, planetMixHookOf } from './systems/mixRoll'
import { MAGNETIC_SKY_BAND } from './systems/render/auroraBand'
import { FIELD_ARC_LAYER_BUDGET } from './systems/render/fieldArcBudget'
import { magneticArtAssets } from './systems/render/magneticArt'
import { planetMixSignatureTag } from './systems/signatureTag'

export const slice: SliceDefinition = {
  id: 'planet-mix',
  register(r) {
    r.generationHook(planetMixHookOf(isPatchNearLava))
    r.oreSignature(planetMixSignatureTag)
    r.magneticGround({
      id: 'planet-mix.magnetic-ground',
      fieldAt: magneticFieldAt,
      isElectrified: isElectrifiedCell,
    })
    // The aurora's ribbon and the field lines' dash, under public/assets/prop/ (#214).
    r.artAssets(magneticArtAssets())
    r.planetSkyBand(MAGNETIC_SKY_BAND)
    r.sceneLayer({ id: FIELD_ARC_LAYER_ID, Layer: FieldArcLayer, budget: FIELD_ARC_LAYER_BUDGET })
    r.reportRows(planetMixReportRows)
    // steampunkDebug.features['planet-mix'].describe(), .mixOf(p, seed), .histogramOf(p, seeds),
    // .getMagneticLooks()
    r.debugActions(planetMixDebugActions)
  },
}
