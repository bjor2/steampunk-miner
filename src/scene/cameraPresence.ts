/**
 * How the camera shows the vehicle's frame this frame: the screen angle of local up, in radians
 * counter-clockwise from screen up. Written by `PlanetCamera` each frame and read by the HUD
 * compass, which draws its local-frame octant turned by it (#33: the renderer adds the camera
 * angle, the model never does). 0 in the rotating camera once it settles.
 */
export const cameraPresence = { localUpScreenAngle: 0 }
