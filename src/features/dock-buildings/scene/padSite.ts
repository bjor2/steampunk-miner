/**
 * What the slice's pad pieces share: where the pad is on the current planet, and the depth the
 * shop buildings and their add-ons draw at. The pad moves only with the planet, so it is read on a
 * render, never per frame.
 */
import { readPlanetWorld } from '../../../store/gameStore'
import { dockSiteOf, type DockSite } from '../../../systems/world/dockSite'

/** Behind the Refinery bay (0.015) and the yard (0.02); a part's draw order steps from here. */
export const BUILDING_Z = 0.005

export function siteOfPlanet(): DockSite | null {
  const { params } = readPlanetWorld()
  return params === null ? null : dockSiteOf(params)
}
