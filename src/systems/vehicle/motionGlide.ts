/**
 * A glide (ticket 390, for the phase move of #261 and G&V's landing rules on it): the body travels
 * in a straight line at one constant speed to a tile's centre and comes to rest there on the
 * glide's last step, with input locked and gravity paused, passing through the walls of at most
 * one named cell on the way (`colliderHalo.ts`).
 *
 * The speed is the distance left over the steps left before the resting step, so a glide that
 * runs undisturbed keeps exactly the speed it set out at, and one a contact nudges finds its line
 * again and still arrives on time. The authority names the arrival tick, so the move takes the
 * same ticks on every machine whatever the frame rate.
 */
import type { TilePoint } from '../world/tileGrid'
import type { Vector2 } from './localFrame'

export interface MotionGlide {
  /** The tile the body comes to rest in, at its centre. */
  to: TilePoint
  /** The first tick the glide no longer drives; the body rests at `to` on the step before. */
  untilTick: number
  /** The one cell whose walls the body passes through on the way, or null for none. */
  passThrough: TilePoint | null
}

/** A glide as one fixed step drives it. */
export interface GlideStep {
  /** The centre of the tile it rests in, in metres. */
  to: Vector2
  /** Fixed steps the glide still drives, this one included. */
  stepsLeft: number
  passThrough: TilePoint | null
}

const HALF_TILE = 0.5

/** The first glide still running at `tick` as this step drives it, or null. */
export function glideStepOf(glides: readonly MotionGlide[], tick: number): GlideStep | null {
  const glide = glides.find((candidate) => tick < candidate.untilTick)
  if (glide === undefined) return null
  return {
    to: { x: glide.to.tx + HALF_TILE, y: glide.to.ty + HALF_TILE },
    stepsLeft: glide.untilTick - tick,
    passThrough: glide.passThrough,
  }
}

/**
 * The velocity that covers the gap to the glide's end evenly over the steps before its last: the
 * last step closes what is left, which is nothing on an undisturbed glide, so it ends at rest.
 */
export function glideVelocityOf(glide: GlideStep, position: Vector2, dt: number): Vector2 {
  const movingSteps = Math.max(1, glide.stepsLeft - 1)
  const seconds = movingSteps * dt
  return { x: (glide.to.x - position.x) / seconds, y: (glide.to.y - position.y) / seconds }
}
