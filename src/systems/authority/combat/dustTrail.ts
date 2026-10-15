/**
 * The dust trail a burrower leaves just under the surface (K-pretrain, ticket 413; TD lock
 * 6180863028 and GD ruling 6180873822 on #320, for the spotter guns combo): pure reads of the
 * saved state, so there is no new field, no event and no protocol change.
 *
 * - `dustTrailWarningsOf`: the player's hunting burrowers, within `reachTiles` of the rig, that
 *   are in rock now and reach an open cell within `withinTicks` of their own walking step (the
 *   step `burrowerFlush.ts` walks, a slow shortening it). Nearest the rig first, then by id. Not
 *   `lungeWarningsOf`, which reads the wind-up.
 * - `surfacedBurrowerIdsOf`: the mirror read, the player's burrowers standing in an open cell with
 *   rock still within one walking step, so they broke the surface this tick or the one before.
 *   The turret's pre-train ranks them first (`turretPretrain.ts`).
 *
 * "Reaches an open cell" measures to the cell's nearest edge, not its centre as a flush's walk
 * does: a burrower in rock is at least half a tile from any other cell's centre, which a few
 * ticks of a 1-1.5 tiles/s walk never cover. The search window is the flush's
 * (`flushReachCapTiles`), so a read is at most 6 burrowers (#9) times that window's cells.
 */
import { MM_PER_METRE } from '../../../constants/physics'
import { FLUSH_REACH_CAP_TILES } from '../../registries/enemyFlushes'
import { tileOfMillimetres } from '../../vehicle/vehiclePose'
import type { TilePoint } from '../../world/tileGrid'
import { CELL_KIND, kindOfCell } from '../../world/worldCell'
import { cellAt } from '../../world/worldState'
import type { AuthorityState } from '../authorityState'
import { planetParamsOf } from '../planetOfState'
import { distanceSq, isWithinMm, type MillimetrePoint } from './combatGeometry'
import type { Enemy } from './combatState'
import { slowedWalkStepMmOf, type StepGround, type Terrain } from './enemyMovement'

export interface DustTrailWarning {
  enemyId: string
  /** The open cell nearest the burrower, where it would break the surface. */
  face: TilePoint
}

interface TrailSighting {
  enemy: Enemy
  face: TilePoint
  distanceSq: number
}

interface TrailWindow {
  reachTiles: number
  withinTicks: number
}

type TileTest = (terrain: Terrain, tile: TilePoint) => boolean

/**
 * The warnings for `playerId` at `tick` (the last settled tick unless given): its burrowers in
 * rock within `reachTiles` that reach an open cell within `withinTicks`, nearest first, then id.
 */
export function dustTrailWarningsOf(
  state: AuthorityState,
  playerId: string,
  reachTiles: number,
  withinTicks: number,
  tick: number = state.tick,
): DustTrailWarning[] {
  const ground = stepGroundOf(state, tick)
  const pose = state.players[playerId]?.vehicle.pose ?? null
  if (ground === null || pose === null) return []
  return warningsAround(ground, pose, playerId, { reachTiles, withinTicks })
}

/** The ids of the player's burrowers in an open cell with rock within one walking step. */
export function surfacedBurrowerIdsOf(ground: StepGround, playerId: string): Set<string> {
  const surfaced = huntingBurrowersOf(ground.state, playerId).filter((enemy) =>
    hasJustSurfaced(ground, enemy),
  )
  return new Set(surfaced.map((enemy) => enemy.id))
}

function warningsAround(
  ground: StepGround,
  pose: MillimetrePoint,
  playerId: string,
  { reachTiles, withinTicks }: TrailWindow,
): DustTrailWarning[] {
  return huntingBurrowersOf(ground.state, playerId)
    .filter((enemy) => isWithinMm(pose, enemy, reachTiles * MM_PER_METRE))
    .filter((enemy) => !isInOpenCell(ground.terrain, enemy))
    .flatMap((enemy) => trailSightingOf(ground, pose, enemy, withinTicks))
    .sort(compareNearestFirst)
    .map(({ enemy, face }) => ({ enemyId: enemy.id, face }))
}

/** The ground the state stands on at `tick`; null between planets. */
function stepGroundOf(state: AuthorityState, tick: number): StepGround | null {
  const params = planetParamsOf(state.planet)
  return params === null ? null : { state, terrain: { world: state.world, params }, tick }
}

/** Burrowers hunting this player: idle ones wait out of detection range and do not move. */
function huntingBurrowersOf(state: AuthorityState, playerId: string): Enemy[] {
  return state.combat.enemies.filter(
    (enemy) => enemy.kind === 'burrower' && enemy.ownerId === playerId && enemy.phase !== 'idle',
  )
}

function trailSightingOf(
  ground: StepGround,
  pose: MillimetrePoint,
  enemy: Enemy,
  withinTicks: number,
): TrailSighting[] {
  const reachMm = withinTicks * slowedWalkStepMmOf(ground, enemy)
  const face = nearestTileWithin(ground.terrain, enemy, reachMm, isOpenTile)
  return face === null ? [] : [{ enemy, face, distanceSq: distanceSq(pose, enemy) }]
}

function hasJustSurfaced(ground: StepGround, enemy: Enemy): boolean {
  if (!isInOpenCell(ground.terrain, enemy)) return false
  const stepMm = slowedWalkStepMmOf(ground, enemy)
  return nearestTileWithin(ground.terrain, enemy, stepMm, isClosedTile) !== null
}

/**
 * The tile passing `test` whose nearest edge is closest to `point`, at most `reachMm` away and
 * inside the flush's capped window; the first in row-then-column order on a tie, null for none.
 */
function nearestTileWithin(
  terrain: Terrain,
  point: MillimetrePoint,
  reachMm: number,
  test: TileTest,
): TilePoint | null {
  const home = tileOfMillimetres(point.x, point.y)
  const windowTiles = Math.min(FLUSH_REACH_CAP_TILES, Math.ceil(reachMm / MM_PER_METRE))
  let nearest: TilePoint | null = null
  let nearestSq = reachMm * reachMm
  for (let ty = home.ty - windowTiles; ty <= home.ty + windowTiles; ty++) {
    for (let tx = home.tx - windowTiles; tx <= home.tx + windowTiles; tx++) {
      const sq = edgeDistanceSq(point, tx, ty)
      if (sq > nearestSq || (sq === nearestSq && nearest !== null)) continue
      if (!test(terrain, { tx, ty })) continue
      nearest = { tx, ty }
      nearestSq = sq
    }
  }
  return nearest
}

/** The squared distance from `point` to the nearest point of tile `(tx, ty)`, 0 inside it. */
function edgeDistanceSq(point: MillimetrePoint, tx: number, ty: number): number {
  const dx = outsideBy(point.x, tx * MM_PER_METRE)
  const dy = outsideBy(point.y, ty * MM_PER_METRE)
  return dx * dx + dy * dy
}

function outsideBy(value: number, low: number): number {
  return Math.max(low - value, 0, value - (low + MM_PER_METRE))
}

function isInOpenCell(terrain: Terrain, point: MillimetrePoint): boolean {
  return isOpenTile(terrain, tileOfMillimetres(point.x, point.y))
}

function isOpenTile(terrain: Terrain, tile: TilePoint): boolean {
  return kindOfCell(cellAt(terrain.world, terrain.params, tile)) === CELL_KIND.air
}

function isClosedTile(terrain: Terrain, tile: TilePoint): boolean {
  return !isOpenTile(terrain, tile)
}

function compareNearestFirst(a: TrailSighting, b: TrailSighting): number {
  if (a.distanceSq !== b.distanceSq) return a.distanceSq - b.distanceSq
  return a.enemy.id < b.enemy.id ? -1 : 1
}
