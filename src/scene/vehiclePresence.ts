/**
 * Where the vehicle is drawn this frame, in metres: written by `VehicleBody` each frame, blended
 * between the last two fixed steps and before any scene `useFrame` runs, and read by the camera,
 * the terrain and the headlamp. A mutable registry, because it changes every frame and must never
 * go through React or the store (CLAUDE.md, frame loop rules).
 */
export const vehiclePresence = { x: 0, y: 0 }
