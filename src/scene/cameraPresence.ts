/**
 * How the camera shows the world this frame, written by `PlanetCamera` each frame.
 *
 * `localUpScreenAngle` is the screen angle of local up, in radians counter-clockwise from screen
 * up; the HUD compass draws its local-frame octant turned by it (#33: the renderer adds the camera
 * angle, the model never does). 0 in the rotating camera once it settles.
 *
 * `viewShortAxisMetres` is the eased zoom (#39) and `widthPixels`/`heightPixels` the canvas, so
 * the debug API can report the framing the player actually sees.
 */
import { VIEW_SHORT_AXIS_DEFAULT_M } from '../constants/scene'

export const cameraPresence = {
  localUpScreenAngle: 0,
  viewShortAxisMetres: VIEW_SHORT_AXIS_DEFAULT_M,
  widthPixels: 0,
  heightPixels: 0,
}
