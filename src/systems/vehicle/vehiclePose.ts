/**
 * The vehicle's reported pose as the authority sees it (decision #11 amendments): integer
 * millimetres and mm/s, the body-up vector scaled to 1024, and `facing` 0 left, 1 right, 2 down,
 * 3 up (#33, frozen under `logSchemaVersion` 1). Everything here is integer arithmetic, so a
 * replayed `commands.ndjson` gives the same tiles and zones on every machine.
 */
import {
  DOCK_STATIONARY_MM_PER_SECOND,
  DRILL_REACH_MM,
  MAX_SPEED_MM_PER_SECOND,
  ZONE_TEST_MAX_MM,
} from '../../constants/balance'
import { MM_PER_METRE, UP_VECTOR_SCALE } from '../../constants/physics'
import type { DockSite } from '../world/dockSite'
import { depthTilesAt } from '../world/planetGeometry'
import type { PlanetParams } from '../world/planetParams'
import type { TilePoint } from '../world/tileGrid'

export interface VehiclePose {
  x: number
  y: number
  vx: number
  vy: number
  upx: number
  upy: number
  facing: Facing
}

export const FACING = { left: 0, right: 1, down: 2, up: 3 } as const

export type Facing = (typeof FACING)[keyof typeof FACING]

export interface IntegerVector {
  x: number
  y: number
}

/** A unit vector rounded at 1024 is within 1 of 1024 long; the check leaves that much play. */
const UP_LENGTH_SQ_MIN = (UP_VECTOR_SCALE - 1) * (UP_VECTOR_SCALE - 1)
const UP_LENGTH_SQ_MAX = (UP_VECTOR_SCALE + 1) * (UP_VECTOR_SCALE + 1)
const MAX_SPEED_SQ = MAX_SPEED_MM_PER_SECOND * MAX_SPEED_MM_PER_SECOND
const DRILL_REACH_SQ = DRILL_REACH_MM * DRILL_REACH_MM

export function isFacing(value: unknown): value is Facing {
  return value === 0 || value === 1 || value === 2 || value === 3
}

/**
 * `a * tangent + b * localUp` with `a, b` in {-1, 0, 1} (#7), at the up vector's 1024 scale. The
 * tangent is `perp(localUp) = (upy, -upx)`, so "right" is screen-right with the planet's top up.
 */
export function facingVectorOf(upx: number, upy: number, facing: Facing): IntegerVector {
  if (facing === FACING.left) return { x: -upy, y: upx }
  if (facing === FACING.right) return { x: upy, y: -upx }
  if (facing === FACING.down) return { x: -upx, y: -upy }
  return { x: upx, y: upy }
}

/** The tile a point in millimetres lies in (tile = 1 m, tile (tx, ty) covers [tx, tx+1)). */
export function tileOfMillimetres(x: number, y: number): TilePoint {
  return { tx: Math.floor(x / MM_PER_METRE), ty: Math.floor(y / MM_PER_METRE) }
}

/**
 * Whole tiles below the surface at a reported pose, the run log envelope's `depthTiles`
 * (client-owned, like the pose); 0 on a planet with no world.
 */
export function depthTilesOfPose(params: PlanetParams | null, pose: IntegerVector): number {
  if (params === null) return 0
  const tile = tileOfMillimetres(pose.x, pose.y)
  return depthTilesAt(params, tile.tx, tile.ty)
}

/** The tile the vehicle's centre is in. */
export function tileOfPose(pose: VehiclePose): TilePoint {
  return tileOfMillimetres(pose.x, pose.y)
}

/** The tile at the drill's nose: one tile from the centre along the facing vector (#7). */
export function noseTileOf(pose: VehiclePose): TilePoint {
  const facing = facingVectorOf(pose.upx, pose.upy, pose.facing)
  return tileOfMillimetres(
    pose.x + Math.floor((facing.x * MM_PER_METRE) / UP_VECTOR_SCALE),
    pose.y + Math.floor((facing.y * MM_PER_METRE) / UP_VECTOR_SCALE),
  )
}

/** Whether a tile's centre is within the drill's reach of the vehicle's centre. */
export function isWithinDrillReach(pose: VehiclePose, tile: TilePoint): boolean {
  const dx = tile.tx * MM_PER_METRE + MM_PER_METRE / 2 - pose.x
  const dy = tile.ty * MM_PER_METRE + MM_PER_METRE / 2 - pose.y
  return dx * dx + dy * dy <= DRILL_REACH_SQ
}

/** Slow enough to dock (#8); the hints (#16) read the same line as "has not moved yet". */
export function isPoseStationary(pose: VehiclePose): boolean {
  return (
    Math.abs(pose.vx) <= DOCK_STATIONARY_MM_PER_SECOND &&
    Math.abs(pose.vy) <= DOCK_STATIONARY_MM_PER_SECOND
  )
}

/** The pad zone of #8: the cleared air above the dock pad, where energy 0 never strands. */
export function isInPadZone(site: DockSite, pose: VehiclePose): boolean {
  const { tx, ty } = tileOfPose(pose)
  return (
    tx >= site.firstColumn &&
    tx <= site.lastColumn &&
    ty > site.padRow &&
    ty <= site.clearanceTopRow
  )
}

/** The pose at rest on the dock point, upright at the top of the planet, facing right. */
export function dockedPoseAt(site: DockSite): VehiclePose {
  return {
    x: site.dockPoint.tx * MM_PER_METRE + MM_PER_METRE / 2,
    y: site.dockPoint.ty * MM_PER_METRE + MM_PER_METRE / 2,
    vx: 0,
    vy: 0,
    upx: 0,
    upy: UP_VECTOR_SCALE,
    facing: FACING.right,
  }
}

/** Why a reported pose cannot be true (#3 host sanity check): too fast, or a bent up vector. */
export function poseProblems(pose: VehiclePose): string[] {
  return [
    ...(isFacing(pose.facing) ? [] : [`facing must be 0 to 3, got ${pose.facing}`]),
    ...(isWithinSpeedBound(pose.vx, pose.vy)
      ? []
      : [`speed must be at most ${MAX_SPEED_MM_PER_SECOND} mm/s`]),
    ...(isUnitUpVector(pose.upx, pose.upy) ? [] : [`up vector must be ${UP_VECTOR_SCALE} long`]),
  ]
}

function isWithinSpeedBound(vx: number, vy: number): boolean {
  const isEachAxisBounded =
    Math.abs(vx) <= MAX_SPEED_MM_PER_SECOND && Math.abs(vy) <= MAX_SPEED_MM_PER_SECOND
  return isEachAxisBounded && vx * vx + vy * vy <= MAX_SPEED_SQ
}

function isUnitUpVector(upx: number, upy: number): boolean {
  const isEachAxisBounded =
    Math.abs(upx) <= UP_VECTOR_SCALE + 1 && Math.abs(upy) <= UP_VECTOR_SCALE + 1
  const lengthSq = upx * upx + upy * upy
  return isEachAxisBounded && lengthSq >= UP_LENGTH_SQ_MIN && lengthSq <= UP_LENGTH_SQ_MAX
}

/**
 * Whether an offset is close enough for the #9 front/side/rear zone test, which squares and
 * multiplies it: beyond 65535 mm a pose is not used, so every product stays below 2^53.
 */
export function isWithinZoneTestRange(dx: number, dy: number): boolean {
  const isEachAxisBounded = Math.abs(dx) <= ZONE_TEST_MAX_MM && Math.abs(dy) <= ZONE_TEST_MAX_MM
  return isEachAxisBounded && dx * dx + dy * dy <= ZONE_TEST_MAX_MM * ZONE_TEST_MAX_MM
}
