/**
 * The slice's one staging provider: the Workshop auto-roll (#170) while docked at the Works, else
 * the unlock pan (#222) while one runs. The roll reads the Works' two attach points once from the
 * shipped art through the kernel `building-attach` ids; the pan reads the slice's own store.
 */
import { SHIPPED_ART } from '../../scene/shippedArt'
import { shopBuildingAttachPointOf } from '../../systems/art/shopBuildingArt'
import type { BuildingAttachUse } from '../../systems/registries/buildingAttach'
import type { VehicleStagingProvider } from '../../systems/registries/vehicleStaging'
import { shownUnlockPan } from './store/unlockPanStore'
import { dockUnlockPanStagingOf } from './systems/render/dockUnlockPan'
import { workshopStagingOf, type WorkshopRollPoints } from './systems/render/workshopStaging'

/** The uses this slice makes of the Works' attach points. */
export const WORKSHOP_ROLL_ATTACH_USES: readonly BuildingAttachUse[] = [
  { id: 'dock-buildings.roll-target', attach: 'workshop.platform' },
  { id: 'dock-buildings.showcase-camera', attach: 'workshop.showcase_cam' },
]

export function createDockStaging(): VehicleStagingProvider {
  const points = workshopRollPoints()
  return {
    id: 'dock-buildings.dock-staging',
    stagingOf: (state, playerId) =>
      workshopStagingOf(state, playerId, points) ?? dockUnlockPanStagingOf(state, shownUnlockPan()),
  }
}

/** Both points are on the shipped Works; the art spec pins them (`shopBuildingArt.test.ts`). */
export function workshopRollPoints(): WorkshopRollPoints {
  const platform = shopBuildingAttachPointOf(SHIPPED_ART, 'upgrade', 'workshop.platform')
  const camera = shopBuildingAttachPointOf(SHIPPED_ART, 'upgrade', 'workshop.showcase_cam')
  if (platform === null || camera === null) throw new Error('the Works has no roll attach points')
  return { platformAtM: platform.atM, showcaseCamAtM: camera.atM }
}
