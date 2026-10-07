/**
 * The dock buildings slice (#175, spec #170): the Assay & Exchange and the Engineering Works on
 * the pad, the Workshop auto-roll, and the in-place add-ons of the #170 amendment (#197, #222) with
 * their facility rows and unlock pan. Presentation only: it reads the authority state and never
 * writes it. No side effects at import; the loader calls `register`.
 */
import type { SliceDefinition } from '../../registries/sliceDefinition'
import { dockBuildingsDebugActions } from './debug'
import { DOCK_ADD_ONS } from './systems/dockAddOns'
import { dockAddOnArtAssetsOf } from './systems/dockAddOnArt'
import { dockFacilitiesOf } from './systems/dockAddOnFacilities'
import { DockAddOns } from './scene/DockAddOns'
import { ShopBuildings } from './scene/ShopBuildings'
import { createDockStaging, WORKSHOP_ROLL_ATTACH_USES } from './dockStaging'

export const slice: SliceDefinition = {
  id: 'dock-buildings',
  register(r) {
    r.worldPiece({ id: 'dock-buildings.shop-buildings', layer: 'platform', Piece: ShopBuildings })
    r.worldPiece({ id: 'dock-buildings.add-ons', layer: 'platform', Piece: DockAddOns })
    WORKSHOP_ROLL_ATTACH_USES.forEach((use) => r.buildingAttachUse(use))
    r.vehicleStaging(createDockStaging())
    // The add-ons' art under public/assets/platform/, shell and moving part each (#197, #214).
    r.artAssets(dockAddOnArtAssetsOf(DOCK_ADD_ONS))
    // The add-ons are their facility rows' buildings: scanner_station, research_lab, drone_bay.
    dockFacilitiesOf(DOCK_ADD_ONS).forEach((facility) => r.dockFacility(facility))
    // steampunkDebug.features['dock-buildings'].getWorkshopRoll(), .getDockAddOns(), .getUnlockPan()
    r.debugActions(dockBuildingsDebugActions)
  },
}
