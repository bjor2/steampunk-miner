/**
 * What travel alone unlocks (#88): the `planet_gate` rows, each on arriving at its listed
 * `planetIndex`. Travel never collects an artefact, builds a facility or sets a manual row, so
 * `endless_unlock` (bind `manual` at planet 40, #80) stays shut however far the run travels.
 */
import type { UnlockRow, UnlockSchedule } from './readUnlockSchedule'
import { isUnlocked, type UnlockProgress } from './unlockSchedule'

const NO_ROW_IDS: ReadonlySet<string> = new Set()

/** The progress a run has from travel only: the furthest planet, and no other bind met. */
export function progressFromTravel(highestPlanetIndex: number): UnlockProgress {
  return {
    highestPlanetIndex,
    collectedArtefactRowIds: NO_ROW_IDS,
    builtFacilityRowIds: NO_ROW_IDS,
    manualUnlockRowIds: NO_ROW_IDS,
  }
}

/** Rows open on `planetIndex` by travel alone. */
export function isUnlockedByTravel(row: UnlockRow, planetIndex: number): boolean {
  return isUnlocked(row, progressFromTravel(planetIndex))
}

/** The rows that open on travel from `fromPlanet` to `toPlanet`, in schedule order. */
export function rowsUnlockedByTravel(
  schedule: UnlockSchedule,
  fromPlanet: number,
  toPlanet: number,
): UnlockRow[] {
  return schedule.rows.filter((row) => isOpenedBetween(row, fromPlanet, toPlanet))
}

function isOpenedBetween(row: UnlockRow, fromPlanet: number, toPlanet: number): boolean {
  return isUnlockedByTravel(row, toPlanet) && !isUnlockedByTravel(row, fromPlanet)
}
