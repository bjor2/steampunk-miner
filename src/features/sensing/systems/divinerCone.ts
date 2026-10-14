/**
 * The Diviner branch's cone (GD lock on #255, ticket 269): narrow but exact. Along the drill's
 * facing it reads every cell within its length and 15° of the axis (`halfAngleTanPerMille`) and
 * marks them as the echo sounder does, cell by cell, gate badges included; it warns of each
 * collapse block still warning over a cell of the cone, with the ticks left, and of each enemy
 * standing in it. The board takes one read for every cell the player's drill breaks, so the reads
 * follow the cut. A pure read of the state on each client: reveal only, like every ping (#203); a
 * magnetic field cuts its length as it cuts every reach (spec #258).
 */
import { vehicleOf, type AuthorityState } from '../../../systems/authority/authorityState'
import {
  isWarningAt,
  refillTickOf,
  type CollapsingBlock,
} from '../../../systems/authority/collapse/collapseState'
import type { Enemy } from '../../../systems/authority/combat/combatState'
import { sensingReachAt } from '../../../systems/authority/magnetic/sensingReach'
import { MM_PER_METRE } from '../../../constants/physics'
import {
  facingVectorOf,
  tileOfMillimetres,
  tileOfPose,
  type IntegerVector,
  type VehiclePose,
} from '../../../systems/vehicle/vehiclePose'
import { blockContaining, blockIdOf } from '../../../systems/world/collapseBlock'
import type { TilePoint } from '../../../systems/world/tileGrid'
import { echoMarksOn, type EchoMark } from './echoPing'
import type { RevealPing } from './revealPing'
import { divinerLengthOf, SENSING_FORK_BALANCE, type DivinerBalance } from './sensingFork'

export type DivinerWarning =
  | { kind: 'collapse'; block: string; tile: TilePoint; ticksLeft: number | null }
  | { kind: 'enemy'; enemyId: string; tile: TilePoint }

export interface DivinerRead {
  /** The cone's cells from the rig's tile, row by row. */
  tiles: readonly TilePoint[]
  marks: readonly EchoMark[]
  /** Collapses first, nearest the rig first, then enemies nearest first. */
  warnings: readonly DivinerWarning[]
}

const HALF_TILE_MM = MM_PER_METRE / 2
const PER_MILLE = 1000

/** The Diviner's read now; null without the Diviner active or a pose. */
export function divinerReadOf(
  state: AuthorityState,
  playerId: string,
  balance: DivinerBalance = SENSING_FORK_BALANCE.diviner,
): DivinerRead | null {
  const length = divinerLengthOf(state, playerId)
  const pose = vehicleOf(state, playerId).pose
  if (length === null || pose === null) return null
  const tiles = divinerConeTilesOf(pose, sensingReachAt(state, tileOfPose(pose), length), balance)
  return {
    tiles,
    marks: echoMarksOn(state, tiles),
    warnings: [...collapseWarningsOf(state, tiles), ...enemyWarningsOf(state, pose, tiles)],
  }
}

/** One cut's read, marked from `tick` for `revealTicks`; null without the Diviner active. */
export function divinerPingOf(
  state: AuthorityState,
  playerId: string,
  tick: number,
  balance: DivinerBalance = SENSING_FORK_BALANCE.diviner,
): RevealPing | null {
  const read = divinerReadOf(state, playerId, balance)
  const pose = vehicleOf(state, playerId).pose
  if (read === null || pose === null) return null
  return {
    centre: tileOfPose(pose),
    marks: read.marks,
    bornTick: tick,
    untilTick: tick + balance.revealTicks,
  }
}

/** Every tile centre within `lengthTiles` of the rig's tile, ahead along the facing, in the cone. */
export function divinerConeTilesOf(
  pose: VehiclePose,
  lengthTiles: number,
  balance: DivinerBalance = SENSING_FORK_BALANCE.diviner,
): TilePoint[] {
  const origin = tileOfPose(pose)
  const axis = facingVectorOf(pose.upx, pose.upy, pose.facing)
  const tiles: TilePoint[] = []
  for (let dy = -lengthTiles; dy <= lengthTiles; dy++) {
    for (let dx = -lengthTiles; dx <= lengthTiles; dx++) {
      if (isInCone(dx, dy, axis, lengthTiles, balance)) {
        tiles.push({ tx: origin.tx + dx, ty: origin.ty + dy })
      }
    }
  }
  return tiles
}

/** Within the length, ahead along the axis, and off it by at most the half-angle's tangent. */
function isInCone(
  dx: number,
  dy: number,
  axis: IntegerVector,
  lengthTiles: number,
  balance: DivinerBalance,
): boolean {
  if (dx * dx + dy * dy > lengthTiles * lengthTiles) return false
  const along = dx * axis.x + dy * axis.y
  const across = Math.abs(dx * axis.y - dy * axis.x)
  return along > 0 && across * PER_MILLE <= balance.halfAngleTanPerMille * along
}

/** Each block still warning over a cone cell, once, in the cone's order. */
function collapseWarningsOf(state: AuthorityState, tiles: readonly TilePoint[]): DivinerWarning[] {
  const warning = warningEntriesByBlockOf(state)
  return firstTilePerBlockOf(tiles).flatMap(({ block, tile }) => {
    const entry = warning.get(block)
    return entry === undefined ? [] : [collapseWarningOf(entry, tile, state.tick)]
  })
}

function warningEntriesByBlockOf(state: AuthorityState): Map<string, CollapsingBlock> {
  const warning = state.collapse.blocks.filter((entry) => isWarningAt(entry, state.tick))
  return new Map(warning.map((entry) => [entry.block, entry]))
}

/** Each block a cone cell lies in, with the first such cell, in the cone's order. */
function firstTilePerBlockOf(tiles: readonly TilePoint[]): { block: string; tile: TilePoint }[] {
  const firsts = new Map<string, TilePoint>()
  for (const tile of tiles) {
    const block = blockIdOf(blockContaining(tileCentreMmOf(tile)))
    if (!firsts.has(block)) firsts.set(block, tile)
  }
  return [...firsts].map(([block, tile]) => ({ block, tile }))
}

/** A braced block shows no countdown: it holds until its brace ends. */
function collapseWarningOf(entry: CollapsingBlock, tile: TilePoint, tick: number): DivinerWarning {
  const ticksLeft = entry.isBraced === true ? null : refillTickOf(entry) - tick
  return { kind: 'collapse', block: entry.block, tile, ticksLeft }
}

/** Each enemy whose tile is a cone cell, nearest the rig first, then by id. */
function enemyWarningsOf(
  state: AuthorityState,
  pose: VehiclePose,
  tiles: readonly TilePoint[],
): DivinerWarning[] {
  const cone = new Set(tiles.map(tileKeyOf))
  return state.combat.enemies
    .filter((enemy) => cone.has(tileKeyOf(tileOfMillimetres(enemy.x, enemy.y))))
    .sort((a, b) => distanceSqOf(pose, a) - distanceSqOf(pose, b) || compareIds(a.id, b.id))
    .map(enemyWarningOf)
}

function enemyWarningOf(enemy: Enemy): DivinerWarning {
  return { kind: 'enemy', enemyId: enemy.id, tile: tileOfMillimetres(enemy.x, enemy.y) }
}

function tileCentreMmOf({ tx, ty }: TilePoint): { xMm: number; yMm: number } {
  return { xMm: tx * MM_PER_METRE + HALF_TILE_MM, yMm: ty * MM_PER_METRE + HALF_TILE_MM }
}

function distanceSqOf(pose: VehiclePose, enemy: Enemy): number {
  const dx = enemy.x - pose.x
  const dy = enemy.y - pose.y
  return dx * dx + dy * dy
}

function compareIds(a: string, b: string): number {
  if (a === b) return 0
  return a < b ? -1 : 1
}

function tileKeyOf({ tx, ty }: TilePoint): string {
  return `${tx},${ty}`
}
