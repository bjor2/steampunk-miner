/**
 * Read-only, so no command and no log line (docs/standards/feature-slices.md 3.14): where the local
 * car is drawn now and where the Works' turntable is, so a browser spec reads the auto-roll (#170
 * TD acceptance 5) through the debug API, never pixels; which add-ons stand on the pad and where
 * (#222); and the unlock pan, armed or started, with the camera weight it stages now.
 */
import type { DebugAction } from '../../debug/debugActionRegistry'
import { vehiclePresence } from '../../scene/vehiclePresence'
import { readAuthorityState } from '../../store/authorityLink'
import { builtFacilityRowIdsOn } from '../../systems/authority/builtFacilities'
import { dockSiteOfPlanet } from '../../systems/authority/planetOfState'
import type { DockSite } from '../../systems/world/dockSite'
import { worksOriginOf } from './systems/render/workshopStaging'
import { workshopRollPoints } from './dockStaging'
import { armedUnlockPanRowId, shownUnlockPan } from './store/unlockPanStore'
import { dockAddOnAssetIdOf, standingDockAddOnsOf, type DockAddOn } from './systems/dockAddOns'
import { dockAddOnOriginOf } from './systems/render/dockAddOnPlacement'
import { dockUnlockPanStagingOf } from './systems/render/dockUnlockPan'

export const dockBuildingsDebugActions: Readonly<Record<string, DebugAction>> = {
  getWorkshopRoll: () => {
    const site = dockSiteOfPlanet(readAuthorityState().planet)
    if (site === null) return { ok: false, problems: ['no planet'] }
    const platformX = worksOriginOf(site).x + workshopRollPoints().platformAtM[0]
    return {
      ok: true,
      presenceX: vehiclePresence.x,
      presenceY: vehiclePresence.y,
      platformX,
      tick: readAuthorityState().tick,
    }
  },
  getDockAddOns: () => {
    const { planet } = readAuthorityState()
    const site = dockSiteOfPlanet(planet)
    if (site === null) return { ok: false, problems: ['no planet'] }
    const standing = standingDockAddOnsOf(builtFacilityRowIdsOn(planet.index))
    return { ok: true, planetIndex: planet.index, addOns: standing.map(reportOf(site)) }
  },
  getUnlockPan: () => {
    const state = readAuthorityState()
    const shown = shownUnlockPan()
    return {
      ok: true,
      tick: state.tick,
      armedRowId: armedUnlockPanRowId(),
      shown,
      cameraWeight: dockUnlockPanStagingOf(state, shown)?.cameraWeight ?? 0,
    }
  },
}

function reportOf(site: DockSite) {
  return (addOn: DockAddOn) => ({
    id: addOn.id,
    rowId: addOn.rowId,
    assetId: dockAddOnAssetIdOf(addOn),
    origin: dockAddOnOriginOf(site, addOn),
  })
}
