/**
 * The vehicle's jump drive (ticket 759, the GD lock on #650): bought once with money, it lets the
 * vehicle's jump cross into another solar system. Absent until bought, so a vehicle without one
 * digests as before and every save from before it holds none.
 */
import type { VehicleState } from './vehicleState'

export function hasJumpDrive(vehicle: Pick<VehicleState, 'jumpDrive'>): boolean {
  return vehicle.jumpDrive === true
}

/** The vehicle with its jump drive fitted. */
export function withJumpDrive(vehicle: VehicleState): VehicleState {
  return { ...vehicle, jumpDrive: true }
}

/** A snapshot's jump drive: absent, or `true` once bought. */
export function isPortableJumpDrive(jumpDrive: unknown): boolean {
  return jumpDrive === undefined || jumpDrive === true
}
