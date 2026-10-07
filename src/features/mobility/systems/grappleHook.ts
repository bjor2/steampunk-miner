/**
 * Where the grapple bites (#162 row and the G&V feel pass, item 7): pressed alone it fires
 * straight up from the miner; facing left or right it fires 45° up on that side. It locks onto the
 * nearest solid cell within 20° of that line and inside its range that it can see, and the winch
 * hauls the miner to the open tile just short of it.
 *
 * Gated and core cells are hooks like any other: the grapple bites them and never breaks one
 * (GD lock on #204 Q5). Lava is no hook. Integer millimetres throughout, so every machine picks
 * the same cell.
 */
import { MM_PER_METRE } from '../../../constants/physics'
import type { AuthorityState } from '../../../systems/authority/authorityState'
import { planetParamsOf } from '../../../systems/authority/planetOfState'
import {
  facingVectorOf,
  FACING,
  tileOfMillimetres,
  tileOfPose,
  type IntegerVector,
  type VehiclePose,
} from '../../../systems/vehicle/vehiclePose'
import type { PlanetParams } from '../../../systems/world/planetParams'
import type { TilePoint } from '../../../systems/world/tileGrid'
import { isAirCell, isLavaCell, isSolidCell } from '../../../systems/world/worldCell'
import { cellAt, type WorldState } from '../../../systems/world/worldState'
import type { GrappleNumbers } from './mobilityEconomy'

export interface GrappleHook {
  hook: TilePoint
  /** The open tile beside the hook, on the miner's side: where the reel ends. */
  to: TilePoint
  /** From the miner's centre to the hook tile's centre. */
  distanceMm: number
}

interface HookCandidate {
  tile: TilePoint
  offset: IntegerVector
  distanceSq: number
}

interface Ground {
  world: WorldState
  params: PlanetParams
}

const PER_MILLE = 1000
const HALF_TILE_MM = MM_PER_METRE / 2
/** Line-of-sight samples a tile: four per tile, so no cell between the miner and a hook is skipped. */
const SIGHT_STEP_MM = MM_PER_METRE / 4

/** The cell the grapple bites from this pose, or null with no valid hook. */
export function grappleHookOf(
  state: AuthorityState,
  pose: VehiclePose,
  numbers: GrappleNumbers,
): GrappleHook | null {
  const params = planetParamsOf(state.planet)
  if (params === null) return null
  const aim = aimOf(pose)
  const inCone = candidatesNearestFirst(pose, numbers.rangeTiles).filter((candidate) =>
    isInAimCone(candidate.offset, aim, numbers.aimConeTanPerMille),
  )
  return firstHookOf({ world: state.world, params }, pose, inCone)
}

/** Straight up the miner's own up; 45° up toward the side it faces left or right. */
export function aimOf(pose: VehiclePose): IntegerVector {
  const up = { x: pose.upx, y: pose.upy }
  if (pose.facing !== FACING.left && pose.facing !== FACING.right) return up
  const side = facingVectorOf(pose.upx, pose.upy, pose.facing)
  return { x: up.x + side.x, y: up.y + side.y }
}

/** Within the cone about `aim`: ahead of the miner, and off the line by at most the cone's tangent. */
export function isInAimCone(offset: IntegerVector, aim: IntegerVector, tanPerMille: number) {
  const along = offset.x * aim.x + offset.y * aim.y
  const across = Math.abs(offset.x * aim.y - offset.y * aim.x)
  return along > 0 && across * PER_MILLE <= tanPerMille * along
}

/** Every tile centre within range of the miner's centre, nearest first, then by row and column. */
function candidatesNearestFirst(pose: VehiclePose, rangeTiles: number): HookCandidate[] {
  const centre = tileOfPose(pose)
  const rangeSq = rangeTiles * MM_PER_METRE * rangeTiles * MM_PER_METRE
  const candidates: HookCandidate[] = []
  for (let ty = centre.ty - rangeTiles; ty <= centre.ty + rangeTiles; ty += 1) {
    for (let tx = centre.tx - rangeTiles; tx <= centre.tx + rangeTiles; tx += 1) {
      const offset = offsetToTileCentre(pose, { tx, ty })
      const distanceSq = offset.x * offset.x + offset.y * offset.y
      if (distanceSq <= rangeSq) candidates.push({ tile: { tx, ty }, offset, distanceSq })
    }
  }
  return candidates.sort(compareNearestFirst)
}

function compareNearestFirst(a: HookCandidate, b: HookCandidate): number {
  if (a.distanceSq !== b.distanceSq) return a.distanceSq - b.distanceSq
  if (a.tile.ty !== b.tile.ty) return a.tile.ty - b.tile.ty
  return a.tile.tx - b.tile.tx
}

function offsetToTileCentre(pose: VehiclePose, tile: TilePoint): IntegerVector {
  return {
    x: tile.tx * MM_PER_METRE + HALF_TILE_MM - pose.x,
    y: tile.ty * MM_PER_METRE + HALF_TILE_MM - pose.y,
  }
}

function firstHookOf(
  ground: Ground,
  pose: VehiclePose,
  candidates: readonly HookCandidate[],
): GrappleHook | null {
  for (const candidate of candidates) {
    const hook = hookAt(ground, pose, candidate)
    if (hook !== null) return hook
  }
  return null
}

/** The candidate as a hook: a solid cell that is not lava, seen through open cells only. */
function hookAt(ground: Ground, pose: VehiclePose, candidate: HookCandidate): GrappleHook | null {
  if (!isHookCell(cellAt(ground.world, ground.params, candidate.tile))) return null
  const to = lastOpenTileBefore(ground, pose, candidate)
  if (to === null) return null
  return { hook: candidate.tile, to, distanceMm: Math.floor(Math.sqrt(candidate.distanceSq)) }
}

function isHookCell(cell: number): boolean {
  return isSolidCell(cell) && !isLavaCell(cell)
}

/**
 * Walks the line from the miner's centre to the hook: the last tile before the hook, when every
 * tile on the way is open; null when something solid stands in between.
 */
function lastOpenTileBefore(
  ground: Ground,
  pose: VehiclePose,
  candidate: HookCandidate,
): TilePoint | null {
  const steps = Math.max(1, Math.ceil(Math.sqrt(candidate.distanceSq) / SIGHT_STEP_MM))
  let last = tileOfPose(pose)
  for (let step = 1; step <= steps; step += 1) {
    const tile = tileOfMillimetres(
      pose.x + Math.floor((candidate.offset.x * step) / steps),
      pose.y + Math.floor((candidate.offset.y * step) / steps),
    )
    if (isSameTile(tile, candidate.tile)) return last
    if (!isAirCell(cellAt(ground.world, ground.params, tile))) return null
    last = tile
  }
  return last
}

function isSameTile(a: TilePoint, b: TilePoint): boolean {
  return a.tx === b.tx && a.ty === b.ty
}
