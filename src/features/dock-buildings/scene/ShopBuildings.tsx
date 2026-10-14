/**
 * The Assay & Exchange and the Engineering Works on the pad (#170, art #174, the Works' hangar
 * ticket 395): each building's baked parts stand at its zone's centre on the pad top, which is the
 * asset's origin, behind the vehicle and the yard. The Works' two moving parts and its steam are
 * drawn by `WorksIdle`, which animates them per frame. No colliders: the pad is the only solid. The
 * pad moves only with the planet, so the buildings render through React on travel.
 */
import { useGameStore } from '../../../store/gameStore'
import { PartQuadMesh } from '../../../scene/PartQuadMesh'
import { SHIPPED_ART } from '../../../scene/shippedArt'
import { SHOP_BUILDING_BAY_IDS, shopBuildingAssetIdOf } from '../../../systems/art/artIds'
import {
  assetQuadsOf,
  atlasMapsOf,
  type AssetQuad,
  type AtlasMaps,
} from '../../../systems/art/assetLook'
import {
  shopBuildingAttachPointOf,
  shopBuildingMovingPartIdsOf,
  type ShopBuildingBayId,
} from '../../../systems/art/shopBuildingArt'
import { bayCentreColumnOf } from '../../../systems/world/dockBays'
import type { DockSite } from '../../../systems/world/dockSite'
import { BUILDING_Z, siteOfPlanet } from './padSite'
import { WorksIdle, type WorksIdleLook } from './WorksIdle'

interface ShopBuildingLook {
  bay: ShopBuildingBayId
  /** The parts that stand still. */
  quads: AssetQuad[]
  maps: AtlasMaps | null
  /** The Works' moving parts and steam, or null for a building with no idle life. */
  idle: WorksIdleLook | null
}

const BUILDINGS: ShopBuildingLook[] = SHOP_BUILDING_BAY_IDS.map(shopBuildingLookOf)

export function ShopBuildings() {
  // The planet's seed re-renders this on travel or a new seed, where the pad moves.
  useGameStore((state) => `${state.planetTier}:${state.planetSeed}`)
  const site = siteOfPlanet()
  if (site === null) return null
  return (
    <>
      {BUILDINGS.map((building) => (
        <ShopBuilding key={building.bay} site={site} building={building} />
      ))}
    </>
  )
}

function ShopBuilding({ site, building }: { site: DockSite; building: ShopBuildingLook }) {
  return (
    <group position={[bayCentreColumnOf(site, building.bay), site.padRow + 1, 0]}>
      {building.quads.map((quad) => (
        <PartQuadMesh key={quad.partId} quad={quad} maps={building.maps} baseZ={BUILDING_Z} />
      ))}
      {building.idle !== null && <WorksIdle look={building.idle} baseZ={BUILDING_Z} />}
    </group>
  )
}

function shopBuildingLookOf(bay: ShopBuildingBayId): ShopBuildingLook {
  const assetId = shopBuildingAssetIdOf(bay)
  const quads = assetQuadsOf(SHIPPED_ART, assetId, 1)
  const maps = atlasMapsOf(SHIPPED_ART, assetId)
  const idle = bay === 'upgrade' ? worksIdleLookOf(quads, maps) : null
  return { bay, quads: idle === null ? quads : stillQuadsOf(quads), maps, idle }
}

/** The Works' gantry and turntable, and the stack top the steam leaves from (`workshop.stack`). */
function worksIdleLookOf(
  quads: readonly AssetQuad[],
  maps: AtlasMaps | null,
): WorksIdleLook | null {
  const [gantryId, turntableId] = shopBuildingMovingPartIdsOf('upgrade')
  const gantry = quads.find((quad) => quad.partId === gantryId)
  const turntable = quads.find((quad) => quad.partId === turntableId)
  const stack = shopBuildingAttachPointOf(SHIPPED_ART, 'upgrade', 'workshop.stack')
  if (gantry === undefined || turntable === undefined || stack === null) return null
  return { gantry, turntable, stack, maps }
}

function stillQuadsOf(quads: readonly AssetQuad[]): AssetQuad[] {
  const moving = shopBuildingMovingPartIdsOf('upgrade')
  return quads.filter((quad) => !moving.includes(quad.partId))
}
