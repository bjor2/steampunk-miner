/**
 * The solar-systems slice's registration: no side effects at import; the loader calls `register`.
 * The palette and the roster are pure reads (ticket 775): the debug surface re-prints a system's
 * seeded roster, so the picks a planner reads are the generator's own, and the looks' tile art
 * joins the asset inventory (ticket 778).
 */
import type { SliceDefinition } from '../../registries/sliceDefinition'
import { solarSystemsDebugActions } from './debug'
import { lookTileArtAssets } from './systems/render/lookArt'

export const slice: SliceDefinition = {
  id: 'solar-systems',
  register(r) {
    // steampunkDebug.features['solar-systems'].describe(), .rosterOf(system, worldSeed)
    r.debugActions(solarSystemsDebugActions)
    // The eight looks' ground motif tiles under public/assets/ground/ (ticket 778, #214).
    r.artAssets(lookTileArtAssets())
  },
}
