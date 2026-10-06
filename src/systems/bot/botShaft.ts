/**
 * The bot's shaft (#29): travelling it, and boring it deeper. On a heat planet the next tile down
 * may free a lava pocket (#113); the shaft then steps sideways along its bottom row to the nearest
 * clear column (east first) and carries on down there, the jog remembered in the layout.
 */
import type { TilePoint } from '../world/tileGrid'
import { openTile } from './botDig'
import { isTooHotToDig } from './botHeat'
import { moveStraight, type BotPilot, type BotPlanet } from './botPilot'
import type { BotSession } from './botSession'
import { isLavaRisk } from './botWorld'
import { shaftColumnAt, shaftTileAt, shaftWaypoints, type MineLayout } from './mineLayout'

/** How far either side the shaft looks for a clear column. */
const JOG_REACH_TILES = 6

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
    if (isTooHotToDig(session)) return false
    const below = shaftTileAt(layout, layout.shaftBottomRow - 1)
    if (isLavaRisk(session.state(), below) && !jogShaft(session, planet)) return false
    if (openTile(session, planet, shaftTileAt(layout, layout.shaftBottomRow - 1)) !== 'opened') {
      return false
    }
    layout.shaftBottomRow -= 1
  }
  return true
}

/** Steps the shaft's bottom sideways to the nearest clear column; false when there is none. */
function jogShaft(session: BotSession, planet: BotPlanet): boolean {
  const { layout } = planet
  const row = layout.shaftBottomRow
  const column = clearColumnNear(session, layout, row)
  if (column === null) return false
  for (const tile of tilesAlong(shaftColumnAt(layout, row), column, row)) {
    if (openTile(session, planet, tile) !== 'opened') return false
  }
  layout.shaftJogs.push({ row, column })
  return true
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
