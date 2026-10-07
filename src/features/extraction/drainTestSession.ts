/**
 * Spec plumbing for the extraction lane, on the loaded slices: a planet-1 session with the mineral
 * drain slotted, the miner at rest in a small pocket dug under the surface where ore lies in the
 * drain's reach, set up through `debug.*` commands like a start scenario. Only specs use it.
 */
import type { DomainEvent } from '../../systems/authority/domainEvent'
import { carveCircleCommand } from '../../systems/authority/groundCommands'
import { setVehicleLoadoutCommand } from '../../systems/authority/loadoutCommands'
import {
  createScriptedSession,
  PARAMS,
  poseAbove,
  type ScriptedSession,
} from '../../systems/authority/scriptedSession'
import { FACING } from '../../systems/vehicle/vehiclePose'
import { SOLID_DENSITY } from '../../systems/world/sampleGrid'
import { surfaceRowOfColumn, type TilePoint } from '../../systems/world/tileGrid'
import { CELL_KIND, kindOfCell, tierOffsetOfCell } from '../../systems/world/worldCell'
import { cellAt, EMPTY_WORLD } from '../../systems/world/worldState'
import { intentToUseSlot } from '../power-up-core'
import { tilesInReachOf } from './systems/drainReach'

export const MM = 1000
export const DRAIN_ID = 'power.mineral_drain'
export const DRAIN_REACH_TILES = 3
/** The channel's hold (#162 4.2): pressed on tick 10, it acts on tick 70. */
export const PRESS_TICK = 10
export const ACT_TICK = 70

/** The pocket the miner stands in: it opens the tiles next to the origin, not the ring past them. */
const POCKET_RADIUS_MM = 1200
/** Columns clear of the dock pad and the starter vein, as `surfaceOreTiles` searches. */
const FIRST_COLUMN = 12
const LAST_COLUMN = 400

export const press = () => intentToUseSlot('powerup.1')

export const ofType = (events: readonly DomainEvent[], type: string) =>
  events.filter((event) => event.type === type)

/**
 * The first tile a few rows under the planet-1 surface whose reach holds `oreCells` ore cells
 * beyond the pocket dug around it, the nearest of them plain band-1 ore (no rarity lead, so a
 * unit sells for V(1)): where the specs stand the miner.
 */
export function standingTileWithOre(oreCells: number): TilePoint {
  for (let tx = FIRST_COLUMN; tx <= LAST_COLUMN; tx++) {
    const surface = surfaceRowOfColumn(tx, PARAMS.radiusTiles)
    for (let depth = 4; depth <= 8; depth++) {
      const origin = { tx, ty: surface - depth }
      if (hasPlainOreAround(origin, oreCells)) return origin
    }
  }
  throw new Error(`no planet-1 tile has ${oreCells} ore cells in the drain's reach`)
}

/** The generated ore tiles in reach of `origin`, past the pocket, nearest first. */
export function oreTilesAround(origin: TilePoint): TilePoint[] {
  return tilesInReachOf(origin, DRAIN_REACH_TILES).filter(
    (tile) => !isInPocket(origin, tile) && isGeneratedOre(tile),
  )
}

/** A session with the drain in `powerup.1`, the miner at rest in the pocket at `origin` by tick 2. */
export function drainSessionAt(origin: TilePoint): ScriptedSession {
  const session = createScriptedSession()
  session.submit(0, setVehicleLoadoutCommand({ 'powerup.1': DRAIN_ID }))
  const centre = centreOf(origin)
  session.submit(
    1,
    carveCircleCommand({ ...centre, radius: POCKET_RADIUS_MM, amount: SOLID_DENSITY }),
  )
  session.submit(2, poseAt(origin))
  return session
}

/** A pose report at rest in the middle of `tile`, upright at the planet's top. */
export function poseAt(tile: TilePoint, vx = 0) {
  const { payload } = poseAbove(tile, FACING.up)
  return { type: 'reportPose' as const, payload: { ...payload, ...centreOf(tile), vx } }
}

export function cellKindAt(session: ScriptedSession, tile: TilePoint) {
  return kindOfCell(cellAt(session.state().world, PARAMS, tile))
}

function centreOf(tile: TilePoint) {
  return { x: tile.tx * MM + MM / 2, y: tile.ty * MM + MM / 2 }
}

function hasPlainOreAround(origin: TilePoint, oreCells: number): boolean {
  const ore = oreTilesAround(origin).slice(0, oreCells)
  return (
    ore.length === oreCells && ore.every((tile) => tierOffsetOfCell(generatedCellAt(tile)) === 0)
  )
}

function generatedCellAt(tile: TilePoint): number {
  return cellAt(EMPTY_WORLD, PARAMS, tile)
}

function isInPocket(origin: TilePoint, tile: TilePoint): boolean {
  return Math.abs(tile.tx - origin.tx) <= 1 && Math.abs(tile.ty - origin.ty) <= 1
}

function isGeneratedOre(tile: TilePoint): boolean {
  return kindOfCell(generatedCellAt(tile)) === CELL_KIND.ore
}
