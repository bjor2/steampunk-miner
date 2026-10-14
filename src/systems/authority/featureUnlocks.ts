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
import type { HeldArtefact } from './heldArtefact'

/**
 * What a session's open rows follow from: its planet and the artefacts its players hold. A live
 * state and a saved one (`PortableState`) both are one, so a save can list its open rows (#401).
 */
export interface UnlockStanding {
  planet: { index: number }
  players: Readonly<Record<string, { artefact: HeldArtefact | null }>>
}

/** Whether the schedule row `featureId` is open on the session's planet; false for an unknown id. */
export function isFeatureUnlocked(state: AuthorityState, featureId: string): boolean {
  return isFeatureUnlockedIn(LOCKED_SCHEDULE, state, featureId)
}

/** The same against `schedule`: the spec seam for a row the lock opens on the first planet. */
export function isFeatureUnlockedIn(
  schedule: UnlockSchedule,
  state: AuthorityState,
  featureId: string,
): boolean {
  const row = schedule.rows.find((candidate) => candidate.id === featureId)
  return row !== undefined && isOpenIn(schedule, row, state)
}

/** The ids of every schedule row open for `standing`, in schedule order. */
export function openFeatureIdsOf(standing: UnlockStanding): string[] {
  return openFeatureIdsIn(LOCKED_SCHEDULE, standing)
}

/** The same against `schedule`: the spec seam for a row the lock has not shipped yet. */
export function openFeatureIdsIn(schedule: UnlockSchedule, standing: UnlockStanding): string[] {
  return schedule.rows.filter((row) => isOpenIn(schedule, row, standing)).map((row) => row.id)
}

/** One `FeatureUnlocked` per `artefact` row a pick opened: in `after`, not yet in `before`. */
export function featureUnlocksOfPick(
  before: AuthorityState,
  after: AuthorityState,
): DomainEventBody[] {
  return LOCKED_SCHEDULE.rows
    .filter((row) => row.bind === 'artefact' && isOpenAfterPick(row, before, after))
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

function isOpenAfterPick(row: UnlockRow, before: AuthorityState, after: AuthorityState): boolean {
  return isOpenIn(LOCKED_SCHEDULE, row, after) && !isOpenIn(LOCKED_SCHEDULE, row, before)
}

function isOpenedBetween(row: UnlockRow, fromPlanet: number, toPlanet: number): boolean {
  return isOpenOn(row, toPlanet) && !isOpenOn(row, fromPlanet)
}

function isOpenOn(row: UnlockRow, planetIndex: number): boolean {
  return isUnlocked(row, progressOnPlanet(planetIndex))
}

/** Only an `artefact` row reads the held artefacts: the other checks run every tick. */
function isOpenIn(schedule: UnlockSchedule, row: UnlockRow, standing: UnlockStanding): boolean {
  if (row.bind !== 'artefact') return isOpenOn(row, standing.planet.index)
  const progress = progressOnPlanet(standing.planet.index)
  const collectedArtefactRowIds = collectedArtefactRowIdsOf(schedule, standing)
  return isUnlocked(row, { ...progress, collectedArtefactRowIds })
}

/** The rows of every cache a player in the session took their artefact from. */
function collectedArtefactRowIdsOf(
  schedule: UnlockSchedule,
  standing: UnlockStanding,
): ReadonlySet<string> {
  const cachePlanets = Object.values(standing.players).flatMap((player) =>
    player.artefact === null ? [] : [player.artefact.fromPlanet],
  )
  return artefactRowIdsOfCaches(schedule, cachePlanets)
}

/** What a session standing on `planetIndex` has met: its travel and its platform's bays. */
function progressOnPlanet(planetIndex: number): UnlockProgress {
  return {
    ...progressFromTravel(planetIndex),
    builtFacilityRowIds: builtFacilityRowIdsOn(planetIndex),
  }
}
