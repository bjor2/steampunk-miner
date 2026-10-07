/**
 * The dock add-ons as shipped Blender assets (#222, art #197): each add-on is one `platform` asset
 * whose shell carries the asset's id and whose one other part is the moving part, so the slice
 * registers the id and that part through `r.artAssets` (#214) and the kernel's asset lint checks
 * the manifest entry, the placeholder and the export like any other platform asset.
 */
import type { ArtAsset } from '../../../systems/registries/artAssets'
import { dockAddOnAssetIdOf, type DockAddOn } from './dockAddOns'

/** #52: the id's prefix is its category; every add-on stands on the platform. */
const DOCK_ADD_ON_CATEGORY = 'platform'

/** What the slice registers: one asset per add-on, its moving part beyond the shell. */
export function dockAddOnArtAssetsOf(addOns: readonly DockAddOn[]): ArtAsset[] {
  return addOns.map((addOn) => ({
    id: dockAddOnAssetIdOf(addOn),
    category: DOCK_ADD_ON_CATEGORY,
    parts: [addOn.movingPartId],
  }))
}
