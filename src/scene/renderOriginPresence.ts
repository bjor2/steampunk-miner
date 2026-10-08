/**
 * The render origin this frame, in planet metres (ticket 339, `systems/render/renderOrigin`): the
 * chunk corner near the rig that Rapier and the GPU measure from, written by `VehicleBody` with
 * the car it draws, so it changes on the same frame as the body's own frame does. Read by the world
 * root and the camera, which place the scene relative to it, by the terrain's lights and by the
 * particle pools, whose f32 buffers hold render-local metres. A mutable registry, because it is
 * read every frame and must never go through React or the store.
 */
export const renderOriginPresence = { x: 0, y: 0 }
