/**
 * Scene numbers. Every value is a placeholder for the demo view until rendering and the rotating
 * camera arrive (Build 5, #22); when a design value replaces one, name its source here.
 */

/** Orthographic camera zoom in pixels per world metre. */
export const CAMERA_ZOOM = 48

/** Camera sits in front of the XY plane and looks down -Z. */
export const CAMERA_POSITION: readonly [number, number, number] = [0, 0, 20]

/** Tiles drawn around the vehicle by the placeholder tile view: a square of this half-size. */
export const TILE_VIEW_RADIUS = 20

/** Placeholder flat colours per cell kind (#13 art and #22 meshes replace them). */
export const TILE_COLOURS = {
  ground: '#4a3b2f',
  ore: '#c9a227',
  core: '#b33a3a',
  indestructible: '#7a7f86',
} as const

/** Placeholder vehicle look: copper body, darker drill head (design doc section 9 art later). */
export const VEHICLE_COLOUR = '#b87333'
export const DRILL_HEAD_COLOUR = '#5b3a1e'
export const DRILL_HEAD_SIZE = 0.35
