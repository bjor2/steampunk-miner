/**
 * When the platform has its Refinery bay (#105 design): the third bay module bolts on when the
 * platform arrives at `refinery.unlockPlanet` and stays from then on. The platform only travels
 * forward, so it has the bay on every planet from there; that is the `refinery_bay` schedule row's
 * `facility` bind (#79), answered from the planet the session is on (`builtFacilities.ts`).
 */
import { refineryUnlockPlanet } from '../../economy/refineryEconomy'

/** The #79 row id of the Refinery bay in the locked schedule (#80). */
export const REFINERY_BAY_ROW_ID = 'refinery_bay'

export function hasRefineryOn(planetIndex: number): boolean {
  return planetIndex >= refineryUnlockPlanet()
}
