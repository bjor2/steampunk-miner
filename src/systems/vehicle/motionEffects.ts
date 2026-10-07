/**
 * Slice effects on the vehicle's motion (ticket 233, the GD lock on #204 Q1 a), folded into the
 * one `VehicleMotion` the fixed step applies:
 *
 * - `liftBp` and `driveBp` add to the engine track's thrust-to-weight, and to its top speed and
 *   acceleration, in basis points. All effects sum, capped at `itemEffectCaps.motionBoostCapBp`
 *   (+2000) on each. A lighter vehicle (a ballast drop) states the lift and drive it gains.
 * - A `burst` drives the body along its direction until `untilTick`, and a `reelTo` pulls it to a
 *   tile's centre; neither moves faster than the engine's top speed plus the cap. Bursts add up
 *   as velocities; the first reel in id order wins.
 * - `hover` holds the body against gravity in open air, and `cling` holds it while a side touches
 *   ground, so it can stay on a wall or ceiling. Thrust still lifts.
 *
 * The authority keeps each window in the slice's section, so an effect replays the same on every
 * machine. No effect is `PLAIN_MOTION`, and the step then runs exactly as before.
 */
import { BASIS_POINTS } from '../../constants/balance'
import { MM_PER_METRE } from '../../constants/physics'
import { ECONOMY } from '../economy/economy'
import { cappedBoostBp } from '../economy/itemEffectCaps'
import type { EngineStats } from '../economy/vehicleStats'
import type { TilePoint } from '../world/tileGrid'
import { dot, type Vector2 } from './localFrame'

export interface MotionBurst {
  /** The direction in the world frame; any length but zero. */
  dirX: number
  dirY: number
  speedMmPerS: number
  /** The first tick the burst no longer drives. */
  untilTick: number
}

export interface VehicleMotionEffect {
  liftBp?: number
  driveBp?: number
  burst?: MotionBurst
  reelTo?: TilePoint
  cling?: boolean
  hover?: boolean
}

export interface VehicleMotion {
  liftBoostBp: number
  driveBoostBp: number
  /** The running bursts' summed velocity in m/s, or null when none runs. */
  burst: Vector2 | null
  /** The centre of the tile a reel pulls toward, in metres, or null. */
  reelTo: Vector2 | null
  isClinging: boolean
  isHovering: boolean
}

export const PLAIN_MOTION: VehicleMotion = Object.freeze({
  liftBoostBp: 0,
  driveBoostBp: 0,
  burst: null,
  reelTo: null,
  isClinging: false,
  isHovering: false,
})

const HALF_TILE = 0.5

/** Every effect at `tick` as one motion, its boosts under `capBp`; none is `PLAIN_MOTION`. */
export function foldMotionEffects(
  effects: readonly VehicleMotionEffect[],
  tick: number,
  capBp: number,
): VehicleMotion {
  if (effects.length === 0) return PLAIN_MOTION
  return {
    liftBoostBp: cappedBoostBp(
      effects.map((effect) => effect.liftBp ?? 0),
      capBp,
    ),
    driveBoostBp: cappedBoostBp(
      effects.map((effect) => effect.driveBp ?? 0),
      capBp,
    ),
    burst: summedBurstOf(effects, tick),
    reelTo: firstReelOf(effects),
    isClinging: effects.some((effect) => effect.cling === true),
    isHovering: effects.some((effect) => effect.hover === true),
  }
}

export function isPlainMotion(motion: VehicleMotion): boolean {
  return motion === PLAIN_MOTION
}

/** The engine with the boosts added; the engine itself when there are none. */
export function boostedEngineOf(engine: EngineStats, motion: VehicleMotion): EngineStats {
  if (motion.liftBoostBp === 0 && motion.driveBoostBp === 0) return engine
  const drive = shareWith(motion.driveBoostBp)
  return {
    speedMax: engine.speedMax * drive,
    accel: engine.accel * drive,
    thrustToWeight: engine.thrustToWeight * shareWith(motion.liftBoostBp),
  }
}

/**
 * The velocity a burst or a reel sets this step, or null when neither runs. `engine` is the
 * boosted one: a reel pulls at its top speed, a burst never passes the base top speed plus the
 * cap.
 */
export function steeredVelocityOf(
  motion: VehicleMotion,
  position: Vector2,
  engine: EngineStats,
  dt: number,
): Vector2 | null {
  if (motion.burst !== null) return withinSpeed(motion.burst, burstSpeedLimitOf(engine, motion))
  if (motion.reelTo !== null) return reelVelocityOf(motion.reelTo, position, engine.speedMax, dt)
  return null
}

/** Whether the body is held against gravity: hovering, or clinging with a side on the ground. */
export function isHeldAgainstGravity(motion: VehicleMotion, isTouchingSurface: boolean): boolean {
  return motion.isHovering || (motion.isClinging && isTouchingSurface)
}

function shareWith(boostBp: number): number {
  return (BASIS_POINTS + boostBp) / BASIS_POINTS
}

function summedBurstOf(effects: readonly VehicleMotionEffect[], tick: number): Vector2 | null {
  const running = effects
    .map((effect) => effect.burst)
    .filter((burst): burst is MotionBurst => burst !== undefined && tick < burst.untilTick)
    .map(burstVelocityOf)
  if (running.length === 0) return null
  return running.reduce((sum, velocity) => ({ x: sum.x + velocity.x, y: sum.y + velocity.y }))
}

function burstVelocityOf(burst: MotionBurst): Vector2 {
  const length = lengthOf({ x: burst.dirX, y: burst.dirY })
  if (length === 0) return { x: 0, y: 0 }
  const speed = burst.speedMmPerS / MM_PER_METRE
  return { x: (burst.dirX / length) * speed, y: (burst.dirY / length) * speed }
}

function firstReelOf(effects: readonly VehicleMotionEffect[]): Vector2 | null {
  const tile = effects.find((effect) => effect.reelTo !== undefined)?.reelTo
  return tile === undefined ? null : { x: tile.tx + HALF_TILE, y: tile.ty + HALF_TILE }
}

/** The engine's own top speed plus the cap, whatever drive boost is running. */
function burstSpeedLimitOf(engine: EngineStats, motion: VehicleMotion): number {
  const base = engine.speedMax / shareWith(motion.driveBoostBp)
  return base * shareWith(ECONOMY.itemEffectCaps.motionBoostCapBp)
}

function withinSpeed(velocity: Vector2, limit: number): Vector2 {
  const speed = lengthOf(velocity)
  if (speed <= limit) return velocity
  return { x: (velocity.x / speed) * limit, y: (velocity.y / speed) * limit }
}

/** Toward the point at `speed`, arriving exactly on the step that reaches it. */
function reelVelocityOf(target: Vector2, position: Vector2, speed: number, dt: number): Vector2 {
  const gap = { x: target.x - position.x, y: target.y - position.y }
  const distance = lengthOf(gap)
  if (distance <= speed * dt) return { x: gap.x / dt, y: gap.y / dt }
  return { x: (gap.x / distance) * speed, y: (gap.y / distance) * speed }
}

function lengthOf(vector: Vector2): number {
  return Math.sqrt(dot(vector, vector))
}
