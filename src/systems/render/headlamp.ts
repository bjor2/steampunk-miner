/**
 * Where the headlamp points (#13 Lighting): along the drill head's facing in the vehicle's local
 * frame (#7), so it lights the tile about to be drilled whatever the camera does. Written into a
 * caller's vector because it runs every frame.
 */
import { FACING, type Facing } from '../vehicle/vehiclePose'
import type { Vector2 } from '../vehicle/localFrame'

/** `[along the tangent, along local up]` for each facing. */
const LOCAL_DIRECTION: Readonly<Record<Facing, readonly [number, number]>> = {
  [FACING.left]: [-1, 0],
  [FACING.right]: [1, 0],
  [FACING.down]: [0, -1],
  [FACING.up]: [0, 1],
}

export function writeHeadlampDirection(up: Vector2, facing: Facing, out: Vector2): void {
  const [along, upward] = LOCAL_DIRECTION[facing]
  // The tangent is perp(up) = (up.y, -up.x), as in localFrame.ts.
  out.x = along * up.y + upward * up.x
  out.y = -along * up.x + upward * up.y
}
