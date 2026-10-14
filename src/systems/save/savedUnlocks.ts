/**
 * The unlocks a save keeps (#401, Horizontal Scaler 3 and 4): the ids of the schedule rows open
 * when it was written, never a count, so a refreshed schedule reads it row by row. They belong to
 * the host world, so a profile never carries them.
 *
 * On load an id this build does not know, or a row it holds back (cut, or a vision row with no
 * module), is dropped and never shown. A row the save does not name opens when the loaded
 * standing opens it, so a `planet_gate` row added since the save is granted when its planet is at
 * or below the saved planet, and an `artefact` row only for the pick that opens it.
 */
import {
  openFeatureIdsIn,
  openFeatureIdsOf,
  type UnlockStanding,
} from '../authority/featureUnlocks'
import type { UnlockSchedule } from '../unlocks/readUnlockSchedule'
import { hasModule, LOCKED_SCHEDULE } from '../unlocks/unlockSchedule'

/** The ids a save written now keeps, in schedule order. */
export function unlocksToSave(standing: UnlockStanding): string[] {
  return openFeatureIdsOf(standing)
}

/** The ids a loaded save shows, in schedule order. */
export function unlocksOnLoad(saved: readonly string[], standing: UnlockStanding): string[] {
  return unlocksOnLoadIn(LOCKED_SCHEDULE, saved, standing)
}

/** The same against `schedule`: the spec seam for rows added since the save. */
export function unlocksOnLoadIn(
  schedule: UnlockSchedule,
  saved: readonly string[],
  standing: UnlockStanding,
): string[] {
  const named = new Set([...saved, ...openFeatureIdsIn(schedule, standing)])
  return schedule.rows.filter((row) => hasModule(row) && named.has(row.id)).map((row) => row.id)
}
