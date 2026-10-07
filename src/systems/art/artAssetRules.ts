/**
 * The rules a slice's art asset id must meet before it joins `blenderAssetIds()` (#214, from the
 * TD's #145 seam lock): kebab-case and under its category (`prop-dynamite-charge` is a prop, the
 * #52 rule), and not an id the kernel already names. A clash between two slices is the registry's
 * own duplicate refusal.
 */
import type { ArtAsset } from '../registries/artAssets'
import { isKebabId, kernelBlenderAssetIds } from './artIds'

/** Why the asset cannot be registered; empty when it can. */
export function artAssetIdProblems(asset: ArtAsset): string[] {
  return [
    ...(isKebabId(asset.id) ? [] : ['is not kebab-case']),
    ...(isUnderCategory(asset) ? [] : [`does not start with "${asset.category}-"`]),
    ...(kernelBlenderAssetIds().includes(asset.id) ? ['is a kernel asset id'] : []),
  ]
}

function isUnderCategory(asset: ArtAsset): boolean {
  return asset.id.startsWith(`${asset.category}-`)
}
