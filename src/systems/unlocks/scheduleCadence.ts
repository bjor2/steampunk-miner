/**
 * The horizontal cadence of a schedule (#81 acceptance 2): how many consecutive campaign planets
 * pass with no horizontal row. Any `bind` and any status but `cut` counts, since the cadence is a
 * property of the locked table, not of what is built yet.
 */
import type { UnlockRow, UnlockSchedule } from './readUnlockSchedule'

/** The longest run of planets 1..`lastPlanet` with no horizontal row listed on them. */
export function longestRunWithoutHorizontal(schedule: UnlockSchedule, lastPlanet: number): number {
  const planetsWithHorizontal = planetsWithHorizontalRows(schedule.rows)
  return longestGap(planetsWithHorizontal, lastPlanet)
}

function planetsWithHorizontalRows(rows: readonly UnlockRow[]): ReadonlySet<number> {
  return new Set(rows.filter(isHorizontalOnSchedule).map((row) => row.planetIndex))
}

function isHorizontalOnSchedule(row: UnlockRow): boolean {
  return row.status !== 'cut' && row.progressionAxis !== 'vertical'
}

function longestGap(planetsWithHorizontal: ReadonlySet<number>, lastPlanet: number): number {
  let longest = 0
  let current = 0
  for (let planet = 1; planet <= lastPlanet; planet += 1) {
    current = planetsWithHorizontal.has(planet) ? 0 : current + 1
    longest = Math.max(longest, current)
  }
  return longest
}
