/**
 * The art the game ships with, as data: the manifest assembled from one entry file per asset
 * (`art/assets/<id>.json`), the checked-in placeholder sidecars (#52 "Placeholders") and the
 * sidecars the export wrote for final assets. Finding those files is the loader's job
 * (`scene/shippedArt.ts`, #116), so two branches that each add an asset add files and edit no
 * shared list; the pure rules take the assembled catalogue as an argument. The asset lint
 * (`assetLint.test.ts`) checks every file on disk against it.
 */
import type { AssetManifest, ManifestEntry } from './assetManifest'
import type { PartsSidecar } from './partsSidecar'

export interface ArtCatalogue {
  manifest: AssetManifest
  placeholderSidecars: readonly PartsSidecar[]
  /** Written by `npm run art:export`; the game draws one only while its manifest entry is final. */
  exportedSidecars: readonly PartsSidecar[]
}

/** The catalogue of the files found, each list sorted by asset id so file order never matters. */
export function artCatalogueOf(
  entries: readonly ManifestEntry[],
  placeholderSidecars: readonly PartsSidecar[],
  exportedSidecars: readonly PartsSidecar[],
): ArtCatalogue {
  return {
    manifest: { assets: [...entries].sort(byId) },
    placeholderSidecars: [...placeholderSidecars].sort(byAssetId),
    exportedSidecars: [...exportedSidecars].sort(byAssetId),
  }
}

export function manifestEntryOf(art: ArtCatalogue, assetId: string): ManifestEntry | null {
  return art.manifest.assets.find((entry) => entry.id === assetId) ?? null
}

export function placeholderSidecarOf(art: ArtCatalogue, assetId: string): PartsSidecar | null {
  return art.placeholderSidecars.find((sidecar) => sidecar.assetId === assetId) ?? null
}

export function exportedSidecarOf(art: ArtCatalogue, assetId: string): PartsSidecar | null {
  return art.exportedSidecars.find((sidecar) => sidecar.assetId === assetId) ?? null
}

function byId(a: ManifestEntry, b: ManifestEntry): number {
  return a.id.localeCompare(b.id)
}

function byAssetId(a: PartsSidecar, b: PartsSidecar): number {
  return a.assetId.localeCompare(b.assetId)
}
