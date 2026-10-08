/**
 * The schedule rows a pick at an artefact cache opens (K2 #324; the Horizontal Scaler's option (a)
 * as the GD locked it on #206, decision 5): every `artefact` row listed on the cache's planet,
 * whichever card was taken, so the cumulative ruler is the same for every choice. The planet is
 * the held artefact's `fromPlanet`, so no new field is saved. A vision row still opens nothing
 * (`isUnlocked`), and a cache on a planet with no artefact row opens nothing.
 */
import type { UnlockSchedule } from './readUnlockSchedule'

const NO_ROW_IDS: ReadonlySet<string> = new Set()

/** The `artefact` row ids listed on each of `cachePlanets`. */
export function artefactRowIdsOfCaches(
  schedule: UnlockSchedule,
  cachePlanets: readonly number[],
): ReadonlySet<string> {
  if (cachePlanets.length === 0) return NO_ROW_IDS
  const ids = schedule.rows
    .filter((row) => row.bind === 'artefact' && cachePlanets.includes(row.planetIndex))
    .map((row) => row.id)
  return new Set(ids)
}
