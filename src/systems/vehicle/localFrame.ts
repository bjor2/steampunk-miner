/**
 * The vehicle's local frame on a round planet (decision #7, "Movement on the round world"):
 * `localUp = pos / |pos|` (sqrt only), holding its last value below 1 m from the centre, and the
 * tangent `perp(localUp) = (up.y, -up.x)`, so "right" is screen-right with the planet's top up.
 * Controls are given in this frame, never in the camera's, so a rotating or fixed camera cannot
 * change what an input does (#7, #13, #33).
 */
import { LOCAL_UP_MIN_RADIUS } from '../../constants/physics'

export interface Vector2 {
  x: number
  y: number
}

export function localUpOf(position: Vector2, lastUp: Vector2): Vector2 {
  const radius = Math.sqrt(position.x * position.x + position.y * position.y)
  if (radius < LOCAL_UP_MIN_RADIUS) return lastUp
  return { x: position.x / radius, y: position.y / radius }
}

export function tangentOf(up: Vector2): Vector2 {
  return { x: up.y, y: -up.x }
}

export function dot(a: Vector2, b: Vector2): number {
  return a.x * b.x + a.y * b.y
}

/** `along * tangent + upward * up`: a local-frame vector back in world space. */
export function fromLocalFrame(up: Vector2, along: number, upward: number): Vector2 {
  const tangent = tangentOf(up)
  return { x: along * tangent.x + upward * up.x, y: along * tangent.y + upward * up.y }
}
