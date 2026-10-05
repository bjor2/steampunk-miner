/**
 * What the drill is doing this physics step, for the headlamp and the sparks: written by the
 * fixed-step vehicle loop from the controller's pose and flags, read by the scene each frame. A
 * mutable registry, like `vehiclePresence`, because it changes every step and never goes through
 * React or the store (CLAUDE.md, frame loop rules).
 */
import { FACING, type Facing } from '../systems/vehicle/vehiclePose'

export const drillPresence: {
  facing: Facing
  isDrilling: boolean
  /** The vehicle's local up, a unit vector. */
  up: { x: number; y: number }
  /** Centre of the tile at the drill's nose, metres. */
  nose: { x: number; y: number }
} = {
  facing: FACING.right,
  isDrilling: false,
  up: { x: 0, y: 1 },
  nose: { x: 0, y: 0 },
}
