/**
 * Blender assets a slice ships (TD's #145 seam lock, kernel ticket B, #214): each entry joins the
 * kernel's #51 inventory in `blenderAssetIds()`, so the manifest lint and the Blender export read
 * one list. The ids are art ids, not slice-prefixed: kebab-case under their category (#52), and
 * never one the kernel or another slice already names (`artAssetIdProblems`).
 */
import type { AssetCategory } from '../art/artIds'
import { defineRegistry, entriesOf } from './seal'

export interface ArtAsset {
  id: string
  category: AssetCategory
  /** Part ids of a non-tiered asset, beyond its own id (`fuse-lamp` on a planted charge). */
  parts?: readonly string[]
}

export const ART_ASSET_REGISTRY = defineRegistry<ArtAsset>('artAssets')

/** Every registered asset, sorted by id. */
export function registeredArtAssets(): readonly ArtAsset[] {
  return entriesOf(ART_ASSET_REGISTRY)
}
