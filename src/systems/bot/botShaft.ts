/**
 * The bot's shaft (#29): travelling it, and boring it deeper. On a heat planet the next tile down
 * may free a lava pocket (#113); the shaft then steps sideways to the nearest clear column (east
 * first) along its bottom row, or failing that along one of the few open rows just above it, and
 * carries on down there, the jog remembered in the layout.
 */
import type { TilePoint } from '../world/tileGrid'
import { openTile } from './botDig'
import { isTooHotToDig } from './botHeat'
import { moveStraight, type BotPilot, type BotPlanet } from './botPilot'
import type { BotSession } from './botSession'
import { isLavaRisk } from './botWorld'
import { shaftColumnAt, shaftTileAt, shaftWaypoints, type MineLayout } from './mineLayout'

/** How far either side the shaft looks for a clear column. */
const JOG_REACH_TILES = 16
/** How many of its own open rows the shaft may climb back to step aside from. */
const JOG_RISE_ROWS = 6

/** Where a jog leaves the shaft and the column it goes to. */
interface JogPlan {
  row: number
  column: number
}

/** From the shaft tile at the pilot's row to the shaft tile at `toRow`, round every jog. */
export function moveAlongShaft(
  session: BotSession,
  pilot: BotPilot,
  layout: MineLayout,
  toRow: number,
): void {
  for (const waypoint of shaftWaypoints(layout, pilot.position.ty, toRow)) {
    moveStraight(session, pilot, waypoint)
  }
}

/** Bores the shaft down to `row` from its open bottom; false when it cannot or should not go on. */
export function boreShaftDownTo(session: BotSession, planet: BotPlanet, row: number): boolean {
  const { layout } = planet
  while (layout.shaftBottomRow > row) {
    if (isTooHotToDig(session, planet)) return false
    const below = shaftTileAt(layout, layout.shaftBottomRow - 1)
    if (isLavaRisk(session.state(), below) && !jogShaft(session, planet)) return false
    if (openTile(session, planet, shaftTileAt(layout, layout.shaftBottomRow - 1)) !== 'opened') {
      return false
    }
    layout.shaftBottomRow -= 1
  }
  return true
}

/** Steps the shaft sideways to the nearest clear column; false when there is none. */
function jogShaft(session: BotSession, planet: BotPlanet): boolean {
  const { layout, pilot } = planet
  const plan = jogPlanOf(session, layout)
  if (plan === null) return false
  moveAlongShaft(session, pilot, layout, plan.row)
  for (const tile of tilesAlong(shaftColumnAt(layout, plan.row), plan.column, plan.row)) {
    if (openTile(session, planet, tile) !== 'opened') return false
  }
  layout.shaftJogs.push(plan)
  layout.shaftBottomRow = plan.row
  return true
}

/** The lowest open row of the shaft's last straight run, then the nearest clear column from it. */
function jogPlanOf(session: BotSession, layout: MineLayout): JogPlan | null {
  for (const row of jogRowsOf(layout)) {
    const column = clearColumnNear(session, layout, row)
    if (column !== null) return { row, column }
  }
  return null
}

/**
 * The bottom row and the open rows above it, up to the last jog (jogs stay in depth order), but
 * never a row with a gallery dug off it: its reach is counted from the shaft's column there.
 */
function jogRowsOf(layout: MineLayout): number[] {
  const bottom = layout.shaftBottomRow
  const lastJog = layout.shaftJogs.at(-1)?.row ?? layout.travelRow
  const highest = Math.min(bottom + JOG_RISE_ROWS, lastJog - 1)
  const rows = Array.from({ length: Math.max(0, highest - bottom + 1) }, (_, at) => bottom + at)
  return rows.filter((row) => !hasDugGallery(layout, row))
}

function hasDugGallery(layout: MineLayout, row: number): boolean {
  const gallery = layout.galleries.get(row)
  return gallery !== undefined && (gallery.east > 0 || gallery.west > 0)
}

function clearColumnNear(session: BotSession, layout: MineLayout, row: number): number | null {
  const from = shaftColumnAt(layout, row)
  for (let reach = 1; reach <= JOG_REACH_TILES; reach++) {
    for (const column of [from + reach, from - reach]) {
      if (isClearJog(session, from, column, row)) return column
    }
  }
  return null
}

/** The way along the row and the tile below its end are all clear of lava. */
function isClearJog(session: BotSession, from: number, to: number, row: number): boolean {
  const state = session.state()
  const below = { tx: to, ty: row - 1 }
  return [...tilesAlong(from, to, row), below].every((tile) => !isLavaRisk(state, tile))
}

/** The tiles after `from` up to and including `to` along `row`. */
function tilesAlong(from: number, to: number, row: number): TilePoint[] {
  const step = Math.sign(to - from)
  return Array.from({ length: Math.abs(to - from) }, (_, at) => ({
    tx: from + step * (at + 1),
    ty: row,
  }))
}
