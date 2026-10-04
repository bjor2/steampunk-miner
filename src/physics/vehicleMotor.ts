/**
 * The vehicle's motor: the ONLY writer of the vehicle body's horizontal motion. It drives by
 * velocity (never teleports), once per fixed physics step; the rule that decides the velocity is
 * systems/vehicleDrive.ts, so no physics world is needed to test it.
 */
import type { RapierRigidBody } from '@react-three/rapier'
import { PHYSICS_TIMESTEP } from '../constants/physics'
import { VEHICLE_DRIVE } from '../constants/scene'
import { nextHorizontalVelocity } from '../systems/vehicleDrive'

// Reused: setLinvel is called every physics step.
const scratchVelocity = { x: 0, y: 0, z: 0 }

/** Call once per physics step, with the throttle read at that step. */
export function driveVehicle(body: RapierRigidBody, throttle: number): void {
  const current = body.linvel()
  scratchVelocity.x = nextHorizontalVelocity(current.x, throttle, PHYSICS_TIMESTEP, VEHICLE_DRIVE)
  scratchVelocity.y = current.y
  body.setLinvel(scratchVelocity, true)
}
