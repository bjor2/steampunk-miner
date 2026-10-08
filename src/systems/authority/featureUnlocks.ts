/**
 * The locked campaign schedule (#80) as the authority sees it (#88): a session has travelled as
 * far as the planet it is on (`Travel` only goes to the next planet), so its `planet_gate` rows
 * are open through that planet, and the `facility` rows of the buildings the platform has there
 * (the Refinery bay from its unlock planet, #105; registered dock buildings from their row's planet,
 * #221). An `artefact` row opens once a player holds an artefact taken from a cache on its planet
 * (K2 #324), and logs its `FeatureUnlocked` with the pick. Manual binds are not answered here yet;
 * travel never opens them, so `endless_unlock` (manual @40) stays shut.
 */
import type { UnlockRow, UnlockSchedule } from '../unlocks/readUnlockSchedule'
import { artefactRowIdsOfCaches } from '../unlocks/artefactCacheRows'
import { progressFromTravel } from '../unlocks/travelUnlocks'
import { isUnlocked, LOCKED_SCHEDULE, type UnlockProgress } from '../unlocks/unlockSchedule'
import type { AuthorityState } from './authorityState'
import type { DomainEventBody } from './domainEvent'
import { builtFacilityRowIdsOn } from './builtFacilities'

/** Whether the schedule row `featureId` is open on the session's planet; false for an unknown id. */
export function isFeatureUnlocked(state: AuthorityState, featureId: string): boolean {
  const row = LOCKED_SCHEDULE.rows.find((candidate) => candidate.id === featureId)
  return row !== undefined && isOpenIn(row, state)
}

/** One `FeatureUnlocked` per `artefact` row a pick opened: in `after`, not yet in `before`. */
export function featureUnlocksOfPick(
  before: AuthorityState,
  after: AuthorityState,
): DomainEventBody[] {
  return LOCKED_SCHEDULE.rows
    .filter((row) => row.bind === 'artefact' && isOpenIn(row, after) && !isOpenIn(row, before))
    .map((row) => ({ type: 'FeatureUnlocked', featureId: row.id }))
}

/** One `FeatureUnlocked` per schedule row that opens on travel from `fromPlanet` to `toPlanet`. */
export function featureUnlocksOfTravel(fromPlanet: number, toPlanet: number): DomainEventBody[] {
  return featureUnlocksOfTravelIn(LOCKED_SCHEDULE, fromPlanet, toPlanet)
}

/** The same against `schedule`: the spec seam for a row the lock has not shipped yet. */
export function featureUnlocksOfTravelIn(
  schedule: UnlockSchedule,
  fromPlanet: number,
  toPlanet: number,
): DomainEventBody[] {
  return schedule.rows
    .filter((row) => isOpenedBetween(row, fromPlanet, toPlanet))
    .map((row) => ({ type: 'FeatureUnlocked', featureId: row.id }))
}

function isOpenedBetween(row: UnlockRow, fromPlanet: number, toPlanet: number): boolean {
  return isOpenOn(row, toPlanet) && !isOpenOn(row, fromPlanet)
}

function isOpenOn(row: UnlockRow, planetIndex: number): boolean {
  return isUnlocked(row, progressOnPlanet(planetIndex))
}

/** Only an `artefact` row reads the held artefacts: the other checks run every tick. */
function isOpenIn(row: UnlockRow, state: AuthorityState): boolean {
  if (row.bind !== 'artefact') return isOpenOn(row, state.planet.index)
  const progress = progressOnPlanet(state.planet.index)
  return isUnlocked(row, { ...progress, collectedArtefactRowIds: collectedArtefactRowIdsOf(state) })
}

/** The rows of every cache a player in the session took their artefact from. */
function collectedArtefactRowIdsOf(state: AuthorityState): ReadonlySet<string> {
  const cachePlanets = Object.values(state.players).flatMap((player) =>
    player.artefact === null ? [] : [player.artefact.fromPlanet],
  )
  return artefactRowIdsOfCaches(LOCKED_SCHEDULE, cachePlanets)
}

/** What a session standing on `planetIndex` has met: its travel and its platform's bays. */
function progressOnPlanet(planetIndex: number): UnlockProgress {
  return {
    ...progressFromTravel(planetIndex),
    builtFacilityRowIds: builtFacilityRowIdsOn(planetIndex),
  }
}
