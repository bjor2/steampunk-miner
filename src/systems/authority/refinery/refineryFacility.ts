/**
 * When the platform has its Refinery bay (#105 design): the third bay module bolts on when the
 * platform arrives at `refinery.unlockPlanet` and stays from then on. The platform only travels
 * forward, so it has the bay on every planet from there; that is the `refinery_bay` schedule row's
 * `facility` bind (#79), answered from the planet the session is on.
 */
import { refineryUnlockPlanet } from '../../economy/refineryEconomy'

/** The #79 row id of the Refinery bay in the locked schedule (#80). */
export const REFINERY_BAY_ROW_ID = 'refinery_bay'

const NO_FACILITY_ROWS: ReadonlySet<string> = new Set()
const REFINERY_ROWS: ReadonlySet<string> = new Set([REFINERY_BAY_ROW_ID])

export function hasRefineryOn(planetIndex: number): boolean {
  return planetIndex >= refineryUnlockPlanet()
}

/** The `facility` rows the platform has built by the time it stands on `planetIndex`. */
export function builtFacilityRowIdsOn(planetIndex: number): ReadonlySet<string> {
  return hasRefineryOn(planetIndex) ? REFINERY_ROWS : NO_FACILITY_ROWS
}
