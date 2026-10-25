/**
 * The Cache Crate as a world prop (ticket 825; G&V on ticket 823: it has no socket, it is a placed
 * world object drawn at its cell, the owner shown by a tag colour). The id takes the #52 kebab
 * form of the kit item id under the prop category; the body is the asset's own part and the owner
 * tag the one part beyond it, so a tint on the tag alone says whose crate it is. Nothing draws it in
 * the world yet: the scene-layer line (#213) is spoken for to its last piece, so a crate layer waits
 * on a kernel allowance; the map markers (ticket 823) keep showing the containers until then.
 */
import { kebabOf } from '../../../systems/art/artIds'
import type { ArtAsset } from '../../../systems/registries/artAssets'

/** The kit item the prop stands for (`planetKits.json`, the first container kind). */
const CACHE_CRATE_ITEM_ID = 'cache_crate'

export const CACHE_CRATE_ASSET_ID = `prop-${kebabOf(CACHE_CRATE_ITEM_ID)}`
export const CACHE_CRATE_TAG_PART_ID = 'crate-tag'

export function cacheCrateArtAsset(): ArtAsset {
  return { id: CACHE_CRATE_ASSET_ID, category: 'prop', parts: [CACHE_CRATE_TAG_PART_ID] }
}
