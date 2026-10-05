/**
 * What a trip is for (#29): ore from one band, or the planet's core; and which gallery of the mine
 * serves it next. Ore galleries skip the rows that cross the core disc; core galleries are exactly
 * those rows, bored toward the planet's centre.
 */
import {
  bandOfRow,
  coreSideOf,
  galleryRows,
  isCoreRow,
  isSideDone,
  openSideOf,
  type GallerySide,
  type MineLayout,
} from './mineLayout'

export type TripGoal = { kind: 'ore'; band: number } | { kind: 'core' }

/** The shallowest gallery the goal wants that still has a side to bore. */
export function nextRow(layout: MineLayout, goal: TripGoal): number | null {
  const rows = galleryRows(layout).filter((row) => isGoalRow(layout, row, goal))
  return rows.find((row) => sideFor(layout, row, goal) !== null) ?? null
}

function isGoalRow(layout: MineLayout, row: number, goal: TripGoal): boolean {
  if (goal.kind === 'core') return isCoreRow(layout, row)
  return !isCoreRow(layout, row) && bandOfRow(layout, row) === goal.band
}

export function sideFor(layout: MineLayout, row: number, goal: TripGoal): GallerySide | null {
  if (goal.kind === 'ore') return openSideOf(layout, row)
  const side = coreSideOf(layout)
  return isSideDone(layout, row, side) ? null : side
}
