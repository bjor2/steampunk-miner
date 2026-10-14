/**
 * What a slice flush (`enemyFlushes`, ticket 386, TD lock 6163443399 on #319) does to a hunting
 * burrower, derived afresh each tick so nothing is saved:
 *
 * - In the rock, with an exposed face near: it walks its own walking step straight at the nearest
 *   open cell, so it stands in the open within `flushTicks`. "Near" is a face whose centre is at
 *   most `flushTicks` steps away (and inside the `flushReachCapTiles` window), so the walk always
 *   arrives in time; a slow (#375) shortens the step and the reach together.
 * - In the open: it hunts on, walking only through open cells while the flush lasts, so it does not
 *   dive straight back in.
 * - With no face near, the flush leaves it alone.
 *
 * Only the burrower's place changes: no cell is cut and no hit is dealt here.
 */
import { MM_PER_METRE } from '../../../constants/physics'
import { FLUSH_REACH_CAP_TILES, flushTicksOf } from '../../registries/enemyFlushes'
import { tileOfMillimetres } from '../../vehicle/vehiclePose'
import type { TilePoint } from '../../world/tileGrid'
import { CELL_KIND, kindOfCell } from '../../world/worldCell'
import { cellAt } from '../../world/worldState'
import { distanceSq, type MillimetrePoint } from './combatGeometry'
import type { Enemy } from './combatState'
import { slowedWalkStepMmOf, type Terrain } from './enemyMovement'
import type { EnemyTurn } from './enemyTurn'

/** A flushed burrower's move this tick: out to `face`, or on through the open. */
export type FlushMove = { kind: 'surface'; face: MillimetrePoint } | { kind: 'stayInTheOpen' }

const STAY_IN_THE_OPEN: FlushMove = { kind: 'stayInTheOpen' }

/** The flush move of a hunting enemy at this tick, or null when no flush moves it. */
export function flushMoveOf(turn: EnemyTurn): FlushMove | null {
  const flushTicks = burrowerFlushTicksOf(turn)
  return flushTicks === null ? null : flushMoveWithin(turn, flushTicks)
}

function burrowerFlushTicksOf({ state, enemy, tick }: EnemyTurn): number | null {
  if (enemy.kind !== 'burrower') return null
  return flushTicksOf(state, enemy, tick)
}

function flushMoveWithin(turn: EnemyTurn, flushTicks: number): FlushMove | null {
  const { terrain, enemy } = turn
  if (isInTheOpen(terrain, enemy)) return STAY_IN_THE_OPEN
  const face = nearestFaceWithin(terrain, enemy, flushTicks * slowedWalkStepMmOf(turn, enemy))
  return face === null ? null : { kind: 'surface', face }
}

function isInTheOpen(terrain: Terrain, point: MillimetrePoint): boolean {
  return isOpenTile(terrain, tileOfMillimetres(point.x, point.y))
}

function isOpenTile(terrain: Terrain, tile: TilePoint): boolean {
  return kindOfCell(cellAt(terrain.world, terrain.params, tile)) === CELL_KIND.air
}

/**
 * The centre of the open cell nearest the enemy within `reachMm` and the capped tile window, the
 * first in row-then-column order on a tie; null when there is none.
 */
export function nearestFaceWithin(
  terrain: Terrain,
  enemy: Enemy,
  reachMm: number,
): MillimetrePoint | null {
  const home = tileOfMillimetres(enemy.x, enemy.y)
  const windowTiles = Math.min(FLUSH_REACH_CAP_TILES, Math.ceil(reachMm / MM_PER_METRE))
  let nearest: MillimetrePoint | null = null
  let nearestSq = reachMm * reachMm
  for (let ty = home.ty - windowTiles; ty <= home.ty + windowTiles; ty++) {
    for (let tx = home.tx - windowTiles; tx <= home.tx + windowTiles; tx++) {
      const centre = centreOfTile(tx, ty)
      const sq = distanceSq(enemy, centre)
      if (sq > nearestSq || (sq === nearestSq && nearest !== null)) continue
      if (!isOpenTile(terrain, { tx, ty })) continue
      nearest = centre
      nearestSq = sq
    }
  }
  return nearest
}

function centreOfTile(tx: number, ty: number): MillimetrePoint {
  const half = MM_PER_METRE / 2
  return { x: tx * MM_PER_METRE + half, y: ty * MM_PER_METRE + half }
}
