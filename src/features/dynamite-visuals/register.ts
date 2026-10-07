/**
 * The dynamite-visuals slice's registration (#215, the wiring of #145): the two Blender assets.
 * No side effects at import; the loader calls `register`.
 */
import type { SliceDefinition } from '../../registries/sliceDefinition'
import { dynamiteArtAssets } from './systems/render/dynamiteArt'

export const slice: SliceDefinition = {
  id: 'dynamite-visuals',
  register(r) {
    // The rack and the planted prop, under public/assets/vehicle/ and public/assets/prop/ (#214).
    r.artAssets(dynamiteArtAssets())
  },
}
