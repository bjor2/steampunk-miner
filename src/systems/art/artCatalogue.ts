/**
 * The art the game ships with, as data: the manifest, the checked-in placeholder sidecars
 * (#52 "Placeholders") and the sidecars the export wrote for final assets. Imported statically, so
 * the pure rules can read them in node; the asset lint (`assetLint.test.ts`) checks that every
 * placeholder and exported sidecar on disk is listed here and that every one validates against
 * schema 1.
 */
import MANIFEST_FILE from '../../../art/asset-manifest.json'
import ENEMY_BURROWER from '../../../art/placeholders/enemy-burrower.parts.json'
import ENEMY_CRAWLER from '../../../art/placeholders/enemy-crawler.parts.json'
import PLATFORM_BAY_SELL from '../../../art/placeholders/platform-bay-sell.parts.json'
import PLATFORM_BAY_UPGRADE from '../../../art/placeholders/platform-bay-upgrade.parts.json'
import PLATFORM_HUB from '../../../art/placeholders/platform-hub.parts.json'
import PROP_ARTEFACT_CACHE from '../../../art/placeholders/prop-artefact-cache.parts.json'
import VEHICLE from '../../../art/placeholders/vehicle.parts.json'
import VEHICLE_EXPORTED from '../../../public/assets/vehicle/vehicle/vehicle.parts.json'
import type { AssetManifest, ManifestEntry } from './assetManifest'
import type { PartsSidecar } from './partsSidecar'

// JSON imports widen tuples to arrays and literals to strings; the lint holds them to the types.
export const ASSET_MANIFEST = MANIFEST_FILE as AssetManifest

export const PLACEHOLDER_SIDECARS: readonly PartsSidecar[] = [
  VEHICLE,
  PLATFORM_HUB,
  PLATFORM_BAY_SELL,
  PLATFORM_BAY_UPGRADE,
  ENEMY_CRAWLER,
  ENEMY_BURROWER,
  PROP_ARTEFACT_CACHE,
] as unknown as readonly PartsSidecar[]

/** Written by `npm run art:export`; the game draws one only while its manifest entry is final. */
export const EXPORTED_SIDECARS: readonly PartsSidecar[] = [
  VEHICLE_EXPORTED,
] as unknown as readonly PartsSidecar[]

export function manifestEntryOf(assetId: string): ManifestEntry | null {
  return ASSET_MANIFEST.assets.find((entry) => entry.id === assetId) ?? null
}

export function placeholderSidecarOf(assetId: string): PartsSidecar | null {
  return PLACEHOLDER_SIDECARS.find((sidecar) => sidecar.assetId === assetId) ?? null
}

export function exportedSidecarOf(assetId: string): PartsSidecar | null {
  return EXPORTED_SIDECARS.find((sidecar) => sidecar.assetId === assetId) ?? null
}
