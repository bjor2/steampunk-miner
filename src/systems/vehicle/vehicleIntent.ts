/**
 * The vehicle intent (#33 section 1): `{ moveX, facing, lift }` in the vehicle's local frame,
 * with no camera input, so camera angle and fixed-camera mode cannot change it. `buildIntent`
 * (`systems/input/buildIntent.ts`) makes it from the held actions of the action map.
 */
import type { Facing } from './vehiclePose'

export interface VehicleIntent {
  moveX: -1 | 0 | 1
  facing: Facing | null
  lift: boolean
}

export const IDLE_INTENT: VehicleIntent = { moveX: 0, facing: null, lift: false }
