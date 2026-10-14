/**
 * Whether a purchase anchored on a locked-schedule row is for sale (Bjor's price-only ruling on
 * #411): a row's planet is the band its price is read from, "priced to arrive around Pn", never
 * "locked until Pn". What still holds a purchase back is that the row ships nothing: a vision or
 * cut row is a held item and is never previewed (HS on #411), a facility row no slice stands a
 * building for never opens, and an artefact or manual row still waits on its own pick or beat,
 * which no planet opens. `isFeatureUnlocked` stays the reader of what travel opened, for the
 * world's own gates (enemies, hazards, acts) and the pacing bot's schedule.
 */
import type { UnlockRow } from '../unlocks/readUnlockSchedule'
import { hasModule, LOCKED_SCHEDULE } from '../unlocks/unlockSchedule'
import type { AuthorityState } from './authorityState'
import { builtFacilityRowIdsOn } from './builtFacilities'
import { isFeatureUnlocked } from './featureUnlocks'

/** Whether a purchase anchored on `featureId` may be bought, wallet aside; false for an unknown id. */
export function isFeatureForSale(state: AuthorityState, featureId: string): boolean {
  const row = LOCKED_SCHEDULE.rows.find((candidate) => candidate.id === featureId)
  if (row === undefined || !hasModule(row)) return false
  return isOpenOnItsOwnPlanet(row) || isFeatureUnlocked(state, featureId)
}

/** The planet a purchase anchored on `featureId` is priced on; null for an unknown id. */
export function featurePricePlanetOf(featureId: string): number | null {
  return LOCKED_SCHEDULE.rows.find((row) => row.id === featureId)?.planetIndex ?? null
}

/**
 * A planet row opens with travel alone, and a facility row once travel reaches the building
 * standing for it, so either is asked on its own planet: past that, the planet only prices it.
 */
function isOpenOnItsOwnPlanet(row: UnlockRow): boolean {
  if (row.bind === 'planet_gate') return true
  return row.bind === 'facility' && builtFacilityRowIdsOn(row.planetIndex).has(row.id)
}
