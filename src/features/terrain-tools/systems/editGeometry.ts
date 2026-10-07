/**
 * Tile geometry the terrain tools share: whole-tile directions from the miner's facing, discs of
 * tiles nearest first with seeded ties, and single grid steps toward or away from a tile. Integer
 * only, so every machine walks the same tiles.
 */
import { UP_VECTOR_SCALE } from '../../../constants/physics'
import {
  facingVectorOf,
  tileOfMillimetres,
  type IntegerVector,
  type VehiclePose,
} from '../../../systems/vehicle/vehiclePose'
import type { TilePoint } from '../../../systems/world/tileGrid'
import { tieBreakOf } from './editSeed'

/** A whole-tile step: each component -1, 0 or 1, never both 0. */
export type GridStep = IntegerVector

/** The eight steps in turning order, so a neighbour index is a 45° turn. */
const STEP_RING: readonly GridStep[] = [
  { x: 1, y: 0 },
  { x: 1, y: 1 },
  { x: 0, y: 1 },
  { x: -1, y: 1 },
  { x: -1, y: 0 },
  { x: -1, y: -1 },
  { x: 0, y: -1 },
  { x: 1, y: -1 },
]

/**
 * A component counts toward the step when it is at least 5/12 of the larger one (about 22.6°), so
 * a vector snaps to the nearest of the eight steps.
 */
const SNAP_NUMERATOR = 12
const SNAP_DENOMINATOR = 5

/** The step nearest the direction the miner faces. */
export function facingStepOf(pose: VehiclePose): GridStep {
  return stepNearest(facingVectorOf(pose.upx, pose.upy, pose.facing))
}

export function stepNearest(vector: IntegerVector): GridStep {
  const larger = Math.max(Math.abs(vector.x), Math.abs(vector.y))
  return { x: snappedOf(vector.x, larger), y: snappedOf(vector.y, larger) }
}

/** The step turned by `eighths` of a turn, counter-clockwise for positive. */
export function turnedStep(step: GridStep, eighths: number): GridStep {
  const index = STEP_RING.findIndex((ring) => ring.x === step.x && ring.y === step.y)
  return STEP_RING[(index + eighths + STEP_RING.length) % STEP_RING.length]
}

export function stepped(tile: TilePoint, step: GridStep, times = 1): TilePoint {
  return { tx: tile.tx + step.x * times, ty: tile.ty + step.y * times }
}

/** The tile `distanceMm` ahead of the miner's centre along its facing. */
export function tileAheadOf(pose: VehiclePose, distanceMm: number): TilePoint {
  const facing = facingVectorOf(pose.upx, pose.upy, pose.facing)
  return tileOfMillimetres(
    pose.x + Math.floor((facing.x * distanceMm) / UP_VECTOR_SCALE),
    pose.y + Math.floor((facing.y * distanceMm) / UP_VECTOR_SCALE),
  )
}

export function distanceSqOf(a: TilePoint, b: TilePoint): number {
  const dx = a.tx - b.tx
  const dy = a.ty - b.ty
  return dx * dx + dy * dy
}

/** Every tile whose centre lies within `radius` tiles of the centre's, nearest first, seeded ties. */
export function tilesNearestFirst(centre: TilePoint, radius: number, seed: number): TilePoint[] {
  return tilesWithin(centre, radius).sort((a, b) => compareNearest(centre, seed, a, b))
}

/** The same tiles, farthest first, seeded ties. */
export function tilesFarthestFirst(centre: TilePoint, radius: number, seed: number): TilePoint[] {
  return tilesWithin(centre, radius).sort((a, b) => compareNearest(centre, seed, b, a))
}

/** One grid step from `tile` toward `target`, along the longer leg; a seeded pick on a diagonal. */
export function stepToward(tile: TilePoint, target: TilePoint, seed: number): TilePoint {
  const dx = target.tx - tile.tx
  const dy = target.ty - tile.ty
  if (isAlongX(dx, dy, seed, tile)) return { tx: tile.tx + Math.sign(dx), ty: tile.ty }
  return { tx: tile.tx, ty: tile.ty + Math.sign(dy) }
}

/** One grid step from `tile` away from `centre`, along the longer leg; seeded on a diagonal. */
export function stepAway(tile: TilePoint, centre: TilePoint, seed: number): TilePoint {
  const mirrored = { tx: 2 * tile.tx - centre.tx, ty: 2 * tile.ty - centre.ty }
  return stepToward(tile, mirrored, seed)
}

function isAlongX(dx: number, dy: number, seed: number, tile: TilePoint): boolean {
  if (Math.abs(dx) !== Math.abs(dy)) return Math.abs(dx) > Math.abs(dy)
  return tieBreakOf(seed, tile) % 2 === 0
}

function tilesWithin(centre: TilePoint, radius: number): TilePoint[] {
  const tiles: TilePoint[] = []
  for (let dy = -radius; dy <= radius; dy += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      if (dx * dx + dy * dy <= radius * radius)
        tiles.push({ tx: centre.tx + dx, ty: centre.ty + dy })
    }
  }
  return tiles
}

function compareNearest(centre: TilePoint, seed: number, a: TilePoint, b: TilePoint): number {
  const byDistance = distanceSqOf(a, centre) - distanceSqOf(b, centre)
  return byDistance !== 0 ? byDistance : tieBreakOf(seed, a) - tieBreakOf(seed, b)
}

function snappedOf(component: number, larger: number): number {
  return SNAP_NUMERATOR * Math.abs(component) >= SNAP_DENOMINATOR * larger
    ? Math.sign(component)
    : 0
}
