/**
 * What a trip is for (#29): ore from one band, or the planet's core; and which gallery of the mine
 * serves it next. Ore galleries skip the rows that cross the core disc; core galleries are exactly
 * those rows, bored toward the planet's centre and then, if the core still needs it, the other way.
 */
import {
  bandOfRow,
  coreSideOf,
  galleryRows,
  isCoreRow,
  isSideDone,
  openSideOf,
  oppositeSideOf,
  type GallerySide,
  type MineLayout,
} from './mineLayout'

export type TripGoal = { kind: 'ore'; band: number } | { kind: 'core' }

/** The shallowest gallery the goal wants that still has a side to bore. */
export function nextRow(layout: MineLayout, goal: TripGoal): number | null {
  const rows = galleryRows(layout).filter((row) => isGoalRow(layout, row, goal))
  if (goal.kind === 'core') return nextCoreRow(layout, rows)
  return rows.find((row) => openSideOf(layout, row) !== null) ?? null
}

/**
 * Every core gallery bores its near side first; the far sides open only once all of those have
 * ended with the core still short, so a shaft that jogs through the core off its middle still
 * reaches the fragments the core needs (#136), and a core the near sides fill mines as before.
 */
function nextCoreRow(layout: MineLayout, rows: number[]): number | null {
  const near = coreSideOf(layout)
  const nearRow = shallowestRowOpenOn(layout, rows, near)
  return nearRow ?? shallowestRowOpenOn(layout, rows, oppositeSideOf(near)) ?? null
}

function shallowestRowOpenOn(
  layout: MineLayout,
  rows: number[],
  side: GallerySide,
): number | undefined {
  return rows.find((row) => !isSideDone(layout, row, side))
}

function isGoalRow(layout: MineLayout, row: number, goal: TripGoal): boolean {
  if (goal.kind === 'core') return isCoreRow(layout, row)
  return !isCoreRow(layout, row) && bandOfRow(layout, row) === goal.band
}

export function sideFor(layout: MineLayout, row: number, goal: TripGoal): GallerySide | null {
  return goal.kind === 'ore' ? openSideOf(layout, row) : openCoreSideOf(layout, row)
}

/** The near side while it is open, then the far side. */
function openCoreSideOf(layout: MineLayout, row: number): GallerySide | null {
  const near = coreSideOf(layout)
  if (!isSideDone(layout, row, near)) return near
  const far = oppositeSideOf(near)
  return isSideDone(layout, row, far) ? null : far
}
