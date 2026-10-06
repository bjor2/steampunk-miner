/**
 * Which enemy the `auto_guns` turret shoots (#107 design "Rules and edge cases"):
 *
 * - within `rangeTiles` of the vehicle's position at the tick;
 * - outside the forward cone the drill owns (`frontDeadConeDeg`, centred on the drill axis), so
 *   the guns cover the sides and the rear, where enemy hits land 1x and 2x;
 * - with a clear line of fire: every cell the shot crosses, the enemy's own included, is open, so
 *   a burrower swimming in rock cannot be hit until it comes out;
 * - the nearest such enemy, equal distances going to the one spawned first, so a replay always
 *   picks the same one.
 *
 * Integer mm and exact integer tests only (#5): the cone is compared as
 * `dot^2 * den >= num * |d|^2 * |f|^2` with `num / den` the exact cos^2 of the cone's half-angle,
 * and the line of fire is sampled every quarter tile with truncating integer steps.
 */
import { MM_PER_METRE } from '../../../constants/physics'
import { gunFrontDeadConeDegrees, gunRangeTiles } from '../../economy/gunStats'
import { facingVectorOf, tileOfMillimetres } from '../../vehicle/vehiclePose'
import { CELL_KIND, kindOfCell } from '../../world/worldCell'
import { cellAt } from '../../world/worldState'
import { distanceSq, isWithinMm, type MillimetrePoint } from './combatGeometry'
import type { Enemy } from './combatState'
import type { DrillFrame } from './hitArc'
import type { Terrain } from './enemyMovement'
import type { VehicleTarget } from './vehicleTarget'

interface Fraction {
  num: number
  den: number
}

/**
 * cos^2 of half the cone for the cone widths whose cosine squares to a fraction, in degrees. The
 * authority may not take a cosine (#5), so another width needs its exact fraction added here.
 */
const HALF_CONE_COS_SQ: Readonly<Record<number, Fraction>> = {
  60: { num: 3, den: 4 },
  90: { num: 1, den: 2 },
  120: { num: 1, den: 4 },
  180: { num: 0, den: 1 },
}

const DEAD_CONE: Fraction = halfConeCosSqOf(gunFrontDeadConeDegrees())
const RANGE_MM = gunRangeTiles() * MM_PER_METRE
/** A quarter tile: no cell the shot crosses is skipped by more than a corner. */
const LINE_STEP_MM = MM_PER_METRE / 4

/** The enemy the guns of the vehicle at `target` would shoot now, or null. */
export function gunTargetOf(
  terrain: Terrain,
  target: VehicleTarget,
  enemies: readonly Enemy[],
): Enemy | null {
  const inSight = enemies.filter((enemy) => isInLineOfFire(terrain, target, enemy))
  return inSight.reduce<Enemy | null>(
    (nearest, enemy) =>
      nearest === null || isNearer(target.position, enemy, nearest) ? enemy : nearest,
    null,
  )
}

/** Inside the forward cone of the drill axis the guns never fire into. */
export function isInDeadCone(frame: DrillFrame, dx: number, dy: number): boolean {
  const axis = facingVectorOf(frame.upx, frame.upy, frame.facing)
  const dot = axis.x * dx + axis.y * dy
  if (dot <= 0) return false
  const offsetSq = dx * dx + dy * dy
  const axisSq = axis.x * axis.x + axis.y * axis.y
  return dot * dot * DEAD_CONE.den >= DEAD_CONE.num * offsetSq * axisSq
}

function isInLineOfFire(terrain: Terrain, target: VehicleTarget, enemy: Enemy): boolean {
  const { position, pose } = target
  return (
    isWithinMm(position, enemy, RANGE_MM) &&
    !isInDeadCone(pose, enemy.x - position.x, enemy.y - position.y) &&
    isLineOpen(terrain, position, enemy)
  )
}

/** Every sampled cell from just past the vehicle to the enemy's own is open air. */
function isLineOpen(terrain: Terrain, from: MillimetrePoint, to: MillimetrePoint): boolean {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / LINE_STEP_MM))
  for (let step = 1; step <= steps; step++) {
    const x = from.x + Math.trunc((dx * step) / steps)
    const y = from.y + Math.trunc((dy * step) / steps)
    if (!isOpenAt(terrain, x, y)) return false
  }
  return true
}

function isOpenAt(terrain: Terrain, x: number, y: number): boolean {
  const cell = cellAt(terrain.world, terrain.params, tileOfMillimetres(x, y))
  return kindOfCell(cell) === CELL_KIND.air
}

function isNearer(from: MillimetrePoint, enemy: Enemy, nearest: Enemy): boolean {
  const order = distanceSq(from, enemy) - distanceSq(from, nearest)
  return order < 0 || (order === 0 && isSpawnedBefore(enemy, nearest))
}

/** Ids are `e1`, `e2`, ... in spawn order: a shorter id is an earlier one. */
function isSpawnedBefore(enemy: Enemy, other: Enemy): boolean {
  if (enemy.id.length !== other.id.length) return enemy.id.length < other.id.length
  return enemy.id < other.id
}

function halfConeCosSqOf(degrees: number): Fraction {
  const fraction = HALF_CONE_COS_SQ[degrees]
  if (fraction === undefined) {
    throw new RangeError(`gun.frontDeadConeDeg ${degrees} has no exact cos^2 in gunTargets.ts`)
  }
  return fraction
}
