/**
 * The path the hazard strip samples (TD scope g on #316, ticket 341: "along the drive line ... down
 * the facing"): from the drill's nose, holding the facing's angle to local up all the way. Down is
 * a radius, level is a circle round the planet's centre (so a level dig on a round planet stays on
 * the line), a diagonal a spiral between. Positions are metres from the planet's centre; `s` is
 * metres travelled along the path from its anchor. Presentation only, so plain floats.
 *
 * With `outward` and `around` the facing's shares along local up and the counter-clockwise tangent,
 * the radius grows by `outward` a metre and the angle by `around / r`:
 * `r(s) = r0 + outward s`, `theta(s) = theta0 + around ln(r(s) / r0) / outward`, or
 * `theta0 + around s / r0` on a level path.
 */
import type { Vector2 } from '../../vehicle/localFrame'

export interface StripPath {
  r0: number
  theta0: number
  /** Share of each metre along local up, -1 (straight down) to 1. */
  outward: number
  /** Share of each metre along the counter-clockwise tangent. */
  around: number
  /** The facing the path was anchored with, to see a turn. */
  facing: Vector2
}

/** Below this an outward share is a level path: the log form would divide by nothing. */
const LEVEL_SHARE = 1e-9
/** A heading this far from the path's, in shares of a metre, is a turn (#279 diagonals are 0.7 off). */
const TURN_SHARE = 1 / 20
/** A path inward stops this short of the centre, where its angle stops meaning anything. */
const CENTRE_STOP_M = 0.5

export function stripPathFrom(nose: Vector2, facing: Vector2): StripPath {
  const r0 = Math.max(Math.hypot(nose.x, nose.y), CENTRE_STOP_M)
  const [upX, upY] = [nose.x / r0, nose.y / r0]
  return {
    r0,
    theta0: Math.atan2(nose.y, nose.x),
    outward: facing.x * upX + facing.y * upY,
    around: -facing.x * upY + facing.y * upX,
    facing: { x: facing.x, y: facing.y },
  }
}

/** Whether `facing` at `nose` keeps the path's angle to local up, so the rig has not turned. */
export function isSameHeading(path: StripPath, nose: Vector2, facing: Vector2): boolean {
  const now = stripPathFrom(nose, facing)
  return Math.abs(now.outward - path.outward) + Math.abs(now.around - path.around) <= TURN_SHARE
}

/** Writes the point `s` metres along the path into `out`. */
export function writePathPoint(path: StripPath, s: number, out: Vector2): Vector2 {
  const r = radiusAt(path, s)
  const theta = angleAt(path, s)
  out.x = r * Math.cos(theta)
  out.y = r * Math.sin(theta)
  return out
}

/** Writes the unit direction of travel `s` metres along the path into `out`. */
export function writePathDirection(path: StripPath, s: number, out: Vector2): Vector2 {
  const theta = angleAt(path, s)
  const [cos, sin] = [Math.cos(theta), Math.sin(theta)]
  out.x = path.outward * cos - path.around * sin
  out.y = path.outward * sin + path.around * cos
  return out
}

/** How far along the path the point nearest `point` lies (exact on the path, close beside it). */
export function progressAlongPath(path: StripPath, point: Vector2): number {
  if (Math.abs(path.outward) >= Math.abs(path.around)) {
    return (Math.hypot(point.x, point.y) - path.r0) / path.outward
  }
  const turned = wrappedAngle(Math.atan2(point.y, point.x) - path.theta0)
  if (Math.abs(path.outward) < LEVEL_SHARE) return (turned * path.r0) / path.around
  const r = path.r0 * Math.exp((turned * path.outward) / path.around)
  return (r - path.r0) / path.outward
}

/** How far `point` lies from the path, metres. */
export function distanceOffPath(path: StripPath, point: Vector2, scratch: Vector2): number {
  writePathPoint(path, progressAlongPath(path, point), scratch)
  return Math.hypot(point.x - scratch.x, point.y - scratch.y)
}

/**
 * The path's last metre worth sampling: where it leaves the disc going out, stops short of the
 * centre going in, or comes round once on a level path.
 */
export function pathEndOf(path: StripPath, radiusMetres: number): number {
  if (path.outward > LEVEL_SHARE) return Math.max(0, (radiusMetres - path.r0) / path.outward)
  if (path.outward < -LEVEL_SHARE) return (path.r0 - CENTRE_STOP_M) / -path.outward
  return 2 * Math.PI * path.r0
}

function radiusAt(path: StripPath, s: number): number {
  return Math.max(path.r0 + path.outward * s, CENTRE_STOP_M)
}

function angleAt(path: StripPath, s: number): number {
  if (Math.abs(path.outward) < LEVEL_SHARE) return path.theta0 + (path.around * s) / path.r0
  const ratio = radiusAt(path, s) / path.r0
  return path.theta0 + (path.around * Math.log(ratio)) / path.outward
}

/** An angle in (-pi, pi]. */
function wrappedAngle(angle: number): number {
  const turns = Math.round(angle / (2 * Math.PI))
  return angle - turns * 2 * Math.PI
}
