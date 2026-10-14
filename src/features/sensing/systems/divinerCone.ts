/**
 * The Diviner branch's cone (GD lock on #255, ticket 269): narrow but exact. Along the drill's
 * facing it reads every cell within its length and 15° of the axis (`halfAngleTanPerMille`). Each
 * use marks them as the echo sounder does, cell by cell, gate badges included, for `revealTicks`;
 * while the Diviner is the active branch the cone also warns of each collapse block still warning
 * over one of its cells, with the ticks left, and of each enemy standing in it. A pure read of the state on each client: reveal only, like every ping (#203); a
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
import {
  DIVINER_ROD,
  divinerLengthOf,
  forkMagnitudeAt,
  SENSING_FORK_BALANCE,
  type DivinerBalance,
} from './sensingFork'
import type { SensingUse } from './sensingUses'

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
  const origin = tileOfPose(pose)
  const tiles = divinerConeTilesOf(
    origin,
    axisOf(pose),
    sensingReachAt(state, origin, length),
    balance,
  )
  return {
    tiles,
    marks: echoMarksOn(state, tiles),
    warnings: [...collapseWarningsOf(state, tiles), ...enemyWarningsOf(state, pose, tiles)],
  }
}

/** The Diviner use's read, marked from its tick for `revealTicks`: the cone's cells, exactly. */
export function divinerPingOf(
  use: SensingUse,
  state: AuthorityState,
  balance: DivinerBalance = SENSING_FORK_BALANCE.diviner,
): RevealPing {
  const pose = state.players[use.playerId]?.vehicle.pose ?? null
  const length = sensingReachAt(state, use.origin, forkMagnitudeAt(DIVINER_ROD, use.mark))
  const tiles = pose === null ? [] : divinerConeTilesOf(use.origin, axisOf(pose), length, balance)
  return {
    centre: use.origin,
    marks: echoMarksOn(state, tiles),
    bornTick: use.tick,
    untilTick: use.tick + balance.revealTicks,
  }
}

/** Every tile centre within `lengthTiles` of `origin`, ahead along `axis`, in the cone. */
export function divinerConeTilesOf(
  origin: TilePoint,
  axis: IntegerVector,
  lengthTiles: number,
  balance: DivinerBalance = SENSING_FORK_BALANCE.diviner,
): TilePoint[] {
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

/** The drill's facing: the way the cone points. */
function axisOf(pose: VehiclePose): IntegerVector {
  return facingVectorOf(pose.upx, pose.upy, pose.facing)
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
