/**
 * The dynamite-visuals slice's registration (#215, the wiring of #145): the two Blender assets
 * and the blast cue that sizes each detonation's shake, flash and thump. No side effects at
 * import; the loader calls `register`.
 */
import type { SliceDefinition } from '../../registries/sliceDefinition'
import { DYNAMITE_BLAST_CUE } from './systems/render/blastCueProvider'
import { dynamiteArtAssets } from './systems/render/dynamiteArt'

export const slice: SliceDefinition = {
  id: 'dynamite-visuals',
  register(r) {
    // The rack and the planted prop, under public/assets/vehicle/ and public/assets/prop/ (#214).
    r.artAssets(dynamiteArtAssets())
    r.chargeBlastCue(DYNAMITE_BLAST_CUE)
  },
}
