/**
 * The locked campaign schedule (#80) as the authority sees it (#88): a session has travelled as
 * far as the planet it is on (`Travel` only goes to the next planet), so its `planet_gate` rows
 * are open through that planet. Artefact, facility and manual binds are not answered here yet;
 * travel alone never opens them, so `endless_unlock` (manual @40) stays shut.
 */
import { rowsUnlockedByTravel, isUnlockedByTravel } from '../unlocks/travelUnlocks'
import { LOCKED_SCHEDULE } from '../unlocks/unlockSchedule'
import type { AuthorityState } from './authorityState'
import type { DomainEventBody } from './domainEvent'

/** Whether the schedule row `featureId` is open on the session's planet; false for an unknown id. */
export function isFeatureUnlocked(state: AuthorityState, featureId: string): boolean {
  const row = LOCKED_SCHEDULE.rows.find((candidate) => candidate.id === featureId)
  return row !== undefined && isUnlockedByTravel(row, state.planet.index)
}

/** One `FeatureUnlocked` per schedule row that opens on travel from `fromPlanet` to `toPlanet`. */
export function featureUnlocksOfTravel(fromPlanet: number, toPlanet: number): DomainEventBody[] {
  return rowsUnlockedByTravel(LOCKED_SCHEDULE, fromPlanet, toPlanet).map((row) => ({
    type: 'FeatureUnlocked',
    featureId: row.id,
  }))
}
