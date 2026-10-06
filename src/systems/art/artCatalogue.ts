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
import ENEMY_TUNNEL_WRECKER from '../../../art/placeholders/enemy-tunnel-wrecker.parts.json'
import PLATFORM_BAY_REFINERY from '../../../art/placeholders/platform-bay-refinery.parts.json'
import PLATFORM_BAY_SELL from '../../../art/placeholders/platform-bay-sell.parts.json'
import PLATFORM_BAY_UPGRADE from '../../../art/placeholders/platform-bay-upgrade.parts.json'
import PLATFORM_HUB from '../../../art/placeholders/platform-hub.parts.json'
import PROP_ARTEFACT_CACHE from '../../../art/placeholders/prop-artefact-cache.parts.json'
import PROP_BLASTING_CHARGE from '../../../art/placeholders/prop-blasting-charge.parts.json'
import VEHICLE_BLASTING_CHARGES from '../../../art/placeholders/vehicle-blasting-charges.parts.json'
import VEHICLE from '../../../art/placeholders/vehicle.parts.json'
import VEHICLE_AUTO_GUNS from '../../../art/placeholders/vehicle-auto-guns.parts.json'
import ENEMY_BURROWER_EXPORTED from '../../../public/assets/enemy/enemy-burrower/enemy-burrower.parts.json'
import ENEMY_CRAWLER_EXPORTED from '../../../public/assets/enemy/enemy-crawler/enemy-crawler.parts.json'
import ENEMY_TUNNEL_WRECKER_EXPORTED from '../../../public/assets/enemy/enemy-tunnel-wrecker/enemy-tunnel-wrecker.parts.json'
import PLATFORM_BAY_REFINERY_EXPORTED from '../../../public/assets/platform/platform-bay-refinery/platform-bay-refinery.parts.json'
import PLATFORM_BAY_SELL_EXPORTED from '../../../public/assets/platform/platform-bay-sell/platform-bay-sell.parts.json'
import PLATFORM_BAY_UPGRADE_EXPORTED from '../../../public/assets/platform/platform-bay-upgrade/platform-bay-upgrade.parts.json'
import PLATFORM_HUB_EXPORTED from '../../../public/assets/platform/platform-hub/platform-hub.parts.json'
import PROP_ARTEFACT_CACHE_EXPORTED from '../../../public/assets/prop/prop-artefact-cache/prop-artefact-cache.parts.json'
import PROP_BLASTING_CHARGE_EXPORTED from '../../../public/assets/prop/prop-blasting-charge/prop-blasting-charge.parts.json'
import VEHICLE_BLASTING_CHARGES_EXPORTED from '../../../public/assets/vehicle/vehicle-blasting-charges/vehicle-blasting-charges.parts.json'
import VEHICLE_EXPORTED from '../../../public/assets/vehicle/vehicle/vehicle.parts.json'
import VEHICLE_AUTO_GUNS_EXPORTED from '../../../public/assets/vehicle/vehicle-auto-guns/vehicle-auto-guns.parts.json'
import type { AssetManifest, ManifestEntry } from './assetManifest'
import type { PartsSidecar } from './partsSidecar'

// JSON imports widen tuples to arrays and literals to strings; the lint holds them to the types.
export const ASSET_MANIFEST = MANIFEST_FILE as AssetManifest

export const PLACEHOLDER_SIDECARS: readonly PartsSidecar[] = [
  VEHICLE,
  VEHICLE_AUTO_GUNS,
  PLATFORM_HUB,
  PLATFORM_BAY_SELL,
  PLATFORM_BAY_UPGRADE,
  PLATFORM_BAY_REFINERY,
  ENEMY_CRAWLER,
  ENEMY_BURROWER,
  ENEMY_TUNNEL_WRECKER,
  PROP_ARTEFACT_CACHE,
  VEHICLE_BLASTING_CHARGES,
  PROP_BLASTING_CHARGE,
] as unknown as readonly PartsSidecar[]

/** Written by `npm run art:export`; the game draws one only while its manifest entry is final. */
export const EXPORTED_SIDECARS: readonly PartsSidecar[] = [
  VEHICLE_EXPORTED,
  VEHICLE_AUTO_GUNS_EXPORTED,
  PLATFORM_HUB_EXPORTED,
  PLATFORM_BAY_SELL_EXPORTED,
  PLATFORM_BAY_UPGRADE_EXPORTED,
  PLATFORM_BAY_REFINERY_EXPORTED,
  ENEMY_CRAWLER_EXPORTED,
  ENEMY_BURROWER_EXPORTED,
  ENEMY_TUNNEL_WRECKER_EXPORTED,
  PROP_ARTEFACT_CACHE_EXPORTED,
  VEHICLE_BLASTING_CHARGES_EXPORTED,
  PROP_BLASTING_CHARGE_EXPORTED,
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
