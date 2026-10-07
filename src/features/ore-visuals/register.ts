/**
 * The ore-visuals slice's registration: no side effects at import; the loader calls `register`.
 * The `oreLook` provider is built and tested (`systems/render/oreLookProvider.ts`) but not yet
 * registered: the kernel shader draws only today's two decals, and the kernel's chunk-batch spec
 * expects planet-1 ore to glow, which the Game Director's G1 grade does not. The kernel renderer
 * ticket that reads the atlas cells registers it (see the #144 resolution).
 */
import type { SliceDefinition } from '../../registries/sliceDefinition'
import { oreVisualsDebugActions } from './debug'
import { oreAtlasArtAssetOf } from './systems/oreAtlasAsset'
import { ORE_LOOKS } from './systems/oreFamilyLooks'

export const slice: SliceDefinition = {
  id: 'ore-visuals',
  register(r) {
    // The three ore atlases under public/assets/ground/ground-ore-atlas/, one part per cell (#214).
    r.artAssets([oreAtlasArtAssetOf(ORE_LOOKS)])
    // steampunkDebug.features['ore-visuals'].describe(), .lookOf(family, tier), .atlasCells()
    r.debugActions(oreVisualsDebugActions)
  },
}
