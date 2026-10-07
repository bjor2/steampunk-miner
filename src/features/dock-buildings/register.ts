/**
 * The dock buildings slice (#175, spec #170): the Assay & Exchange and the Engineering Works on
 * the pad, and the Workshop auto-roll. Presentation only: it reads the authority state and never
 * writes it. No side effects at import; the loader calls `register`.
 */
import type { SliceDefinition } from '../../registries/sliceDefinition'
import { dockBuildingsDebugActions } from './debug'
import { ShopBuildings } from './scene/ShopBuildings'
import { createWorkshopRoll, WORKSHOP_ROLL_ATTACH_USES } from './workshopRoll'

export const slice: SliceDefinition = {
  id: 'dock-buildings',
  register(r) {
    r.worldPiece({ id: 'dock-buildings.shop-buildings', layer: 'platform', Piece: ShopBuildings })
    WORKSHOP_ROLL_ATTACH_USES.forEach((use) => r.buildingAttachUse(use))
    r.vehicleStaging(createWorkshopRoll())
    // steampunkDebug.features['dock-buildings'].getWorkshopRoll()
    r.debugActions(dockBuildingsDebugActions)
  },
}
