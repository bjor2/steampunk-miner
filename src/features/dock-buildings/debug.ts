/**
 * Read-only, so no command and no log line (docs/standards/feature-slices.md 3.14): where the local
 * car is drawn now and where the Works' turntable is, so a browser spec reads the auto-roll (#170
 * TD acceptance 5) through the debug API, never pixels.
 */
import type { DebugAction } from '../../debug/debugActionRegistry'
import { vehiclePresence } from '../../scene/vehiclePresence'
import { readAuthorityState } from '../../store/authorityLink'
import { dockSiteOfPlanet } from '../../systems/authority/planetOfState'
import { worksOriginOf } from './systems/render/workshopStaging'
import { workshopRollPoints } from './workshopRoll'

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
}
