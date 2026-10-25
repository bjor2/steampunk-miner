/**
 * Every Blender asset the planet-kit slice ships (ticket 825, through `r.artAssets`, #214): the
 * four kit sockets' parts on the rig, the five merchant frontages on the Assay & Exchange and the
 * Cache Crate prop. The ids join `blenderAssetIds()`, so the manifest lint and `art:export` read
 * one list; the sources live under `art/blender/<id>/` and the exports under `public/assets/`.
 */
import type { ArtAsset } from '../../../systems/registries/artAssets'
import { cacheCrateArtAsset } from './cacheCrateArt'
import { KIT_SOCKETS, kitSocketArtAssets } from './kitSockets'
import { MERCHANT_ART, merchantArtAssets } from './merchantArt'

export function planetKitArtAssets(): ArtAsset[] {
  return [
    ...kitSocketArtAssets(KIT_SOCKETS),
    ...merchantArtAssets(MERCHANT_ART),
    cacheCrateArtAsset(),
  ]
}
