import { VEHICLE_COLLIDER_SIZE } from '../constants/physics'

/**
 * Where the vehicle is drawn this frame, in metres: written by `VehicleBody` each frame, blended
 * between the last two fixed steps and before any scene `useFrame` runs, and read by the camera,
 * the terrain and the headlamp. `bodyHalfSide` is the collider's half side, m, written by the
 * vehicle loop each step as it grows with the width level (ticket 750); the camera frames by it.
 * A mutable registry, because it changes every frame and must never go through React or the store
 * (CLAUDE.md, frame loop rules).
 */
export const vehiclePresence = { x: 0, y: 0, bodyHalfSide: VEHICLE_COLLIDER_SIZE / 2 }
