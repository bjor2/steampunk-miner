/**
 * Which enemies the `auto_guns` turret can shoot (#107 design "Rules and edge cases"):
 *
 * - within the turret shape's `rangeTiles` of the vehicle's position at the tick (#107's 8 with no
 *   turret module, ticket 382);
 * - outside the forward cone the drill owns (`frontDeadConeDeg`, centred on the drill axis), so
 *   the guns cover the sides and the rear, where enemy hits land 1x and 2x, unless the sentry cam
 *   has opened it (`rigStillness.ts`);
 * - with a clear line of fire: every cell the shot crosses, the enemy's own included, is open, so
 *   a burrower swimming in rock cannot be hit until it comes out;
 * - the nearest such enemy, equal distances going to the one spawned first, so a replay always
 *   picks the same one. The fire director's order and the ricochet are `turretAim.ts`.
 *
 * Integer mm and exact integer tests only (#5): the cone is compared as
 * `dot^2 * den >= num * |d|^2 * |f|^2` with `num / den` the exact cos^2 of the cone's half-angle,
 * and the line of fire is sampled every quarter tile with truncating integer steps.
 */
import { MM_PER_METRE } from '../../../constants/physics'
import { ECONOMY } from '../../economy/economy'
import { gunFrontDeadConeDegrees } from '../../economy/gunStats'
import type { TurretShape } from '../../registries/autoGuns'
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
const RANGE_CAP_MM = ECONOMY.gun.turretCaps.gunRangeCap * MM_PER_METRE
/** A quarter tile: no cell the shot crosses is skipped by more than a corner. */
const LINE_STEP_MM = MM_PER_METRE / 4

/** What a due shot sees with: the rig as enemies see it, its reach and the drill's cone. */
export interface TurretSight {
  terrain: Terrain
  target: VehicleTarget
  rangeMm: number
  isForwardConeOpen: boolean
}

export function turretSightOf(
  terrain: Terrain,
  target: VehicleTarget,
  shape: TurretShape,
  isForwardConeOpen: boolean,
): TurretSight {
  return { terrain, target, rangeMm: shape.rangeTiles * MM_PER_METRE, isForwardConeOpen }
}

/** Some enemy within the turret's longest range: only then is a shot's shape worth reading. */
export function isAnyEnemyWithinRangeCap(target: VehicleTarget, enemies: readonly Enemy[]) {
  return enemies.some((enemy) => isWithinMm(target.position, enemy, RANGE_CAP_MM))
}

/** In reach and outside a closed forward cone, whatever lies between: a bounce may still find it. */
export function enemiesInReach(sight: TurretSight, enemies: readonly Enemy[]): Enemy[] {
  const { position } = sight.target
  return enemies.filter(
    (enemy) => isWithinMm(position, enemy, sight.rangeMm) && isAimable(sight, position, enemy),
  )
}

/** A straight line from the rig to the enemy crosses only open cells. */
export function isInLineOfFire(sight: TurretSight, enemy: Enemy): boolean {
  return isLineOpen(sight.terrain, sight.target.position, enemy)
}

/** The guns may point from `from` at `toward`: the drill's cone is open or `toward` is outside it. */
export function isAimable(
  sight: TurretSight,
  from: MillimetrePoint,
  toward: MillimetrePoint,
): boolean {
  const { pose } = sight.target
  return sight.isForwardConeOpen || !isInDeadCone(pose, toward.x - from.x, toward.y - from.y)
}

/** The nearest of `enemies` to `from`, equal distances going to the one spawned first. */
export function nearestOf(from: MillimetrePoint, enemies: readonly Enemy[]): Enemy | null {
  return enemies.reduce<Enemy | null>(
    (nearest, enemy) => (nearest === null || isNearer(from, enemy, nearest) ? enemy : nearest),
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

/** Every sampled cell from just past `from` to `to`'s own is open air. */
export function isLineOpen(terrain: Terrain, from: MillimetrePoint, to: MillimetrePoint): boolean {
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

export function isOpenAt(terrain: Terrain, x: number, y: number): boolean {
  const cell = cellAt(terrain.world, terrain.params, tileOfMillimetres(x, y))
  return kindOfCell(cell) === CELL_KIND.air
}

/** Closer to `from`, or as close and spawned first. */
export function isNearer(from: MillimetrePoint, enemy: Enemy, nearest: Enemy): boolean {
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
