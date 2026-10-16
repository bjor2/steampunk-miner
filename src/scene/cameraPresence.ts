/**
 * How the camera shows the world this frame, written by `PlanetCamera` each frame.
 *
 * `localUpScreenAngle` is the screen angle of local up, in radians counter-clockwise from screen
 * up; the HUD compass draws its local-frame octant turned by it (#33: the renderer adds the camera
 * angle, the model never does). 0 in the rotating camera once it settles.
 *
 * `viewShortAxisMetres` is the eased zoom (#39), metres down the screen's height (ticket 484),
 * `viewHorizontalMetres` the width it gives, and `widthPixels`/`heightPixels` the canvas, so
 * the debug API can report the framing the player actually sees: the player's zoom, pulled back
 * for speed (ticket 338). `feltSpeedCellsPerSecond`, `leadShare` and `sideLeadShare` are the speed
 * framing's felt speed and leans, read by the debug API to log the ground visible ahead. `vehicleFromCentreX/Y`
 * (world metres from the point the camera looks at to the vehicle) and `turnRadians` (the camera's
 * roll) let the debug API say where the vehicle is on screen (#500's layout specs).
 * `followLagMetres` is how far the slow-speed ease trails the drawn body (ticket 515).
 */
import { VIEW_SHORT_AXIS_DEFAULT_M } from '../constants/scene'

export const cameraPresence = {
  localUpScreenAngle: 0,
  viewShortAxisMetres: VIEW_SHORT_AXIS_DEFAULT_M,
  viewHorizontalMetres: VIEW_SHORT_AXIS_DEFAULT_M,
  widthPixels: 0,
  heightPixels: 0,
  feltSpeedCellsPerSecond: 0,
  leadShare: 0,
  sideLeadShare: 0,
  vehicleFromCentreX: 0,
  vehicleFromCentreY: 0,
  turnRadians: 0,
  followLagMetres: 0,
}
