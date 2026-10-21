/**
 * The look assets the rig look table names (ticket 640, TD ruling on #579), as Blender assets for
 * `r.artAssets` (#214): each joins `blenderAssetIds()`, so the export and the manifest lint read
 * them, with the part ids the table's steps may name. One list, the table's `lookAssets`, so a new
 * look asset is data only.
 */
import type { ArtAsset } from '../../../systems/registries/artAssets'
import type { RigLookTable } from './rigLookTableChecks'

export function rigLookArtAssetsOf(table: RigLookTable): ArtAsset[] {
  return Object.entries(table.lookAssets).map(([id, parts]) => ({ id, category: 'vehicle', parts }))
}
