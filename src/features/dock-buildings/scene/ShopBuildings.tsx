/**
 * The Assay & Exchange and the Engineering Works on the pad (#170, art #174): each building's
 * baked parts stand at its zone's centre on the pad top, which is the asset's origin, behind the
 * vehicle and the yard. No colliders: the pad is the only solid. The pad moves only with the
 * planet, so this renders through React on travel, never per frame.
 */
import { useGameStore } from '../../../store/gameStore'
import { PartQuadMesh } from '../../../scene/PartQuadMesh'
import { SHIPPED_ART } from '../../../scene/shippedArt'
import { SHOP_BUILDING_BAY_IDS, shopBuildingAssetIdOf } from '../../../systems/art/artIds'
import { assetQuadsOf, atlasMapsOf } from '../../../systems/art/assetLook'
import type { ShopBuildingBayId } from '../../../systems/art/shopBuildingArt'
import { bayCentreColumnOf } from '../../../systems/world/dockBays'
import type { DockSite } from '../../../systems/world/dockSite'
import { BUILDING_Z, siteOfPlanet } from './padSite'

const BUILDINGS = SHOP_BUILDING_BAY_IDS.map((bay) => ({
  bay,
  quads: assetQuadsOf(SHIPPED_ART, shopBuildingAssetIdOf(bay), 1),
  maps: atlasMapsOf(SHIPPED_ART, shopBuildingAssetIdOf(bay)),
}))

export function ShopBuildings() {
  // The planet's seed re-renders this on travel or a new seed, where the pad moves.
  useGameStore((state) => `${state.planetTier}:${state.planetSeed}`)
  const site = siteOfPlanet()
  if (site === null) return null
  return (
    <>
      {BUILDINGS.map((building) => (
        <ShopBuilding key={building.bay} site={site} {...building} />
      ))}
    </>
  )
}

function ShopBuilding({
  site,
  bay,
  quads,
  maps,
}: { site: DockSite; bay: ShopBuildingBayId } & Omit<(typeof BUILDINGS)[number], 'bay'>) {
  return (
    <group position={[bayCentreColumnOf(site, bay), site.padRow + 1, 0]}>
      {quads.map((quad) => (
        <PartQuadMesh key={quad.partId} quad={quad} maps={maps} baseZ={BUILDING_Z} />
      ))}
    </group>
  )
}
