/**
 * Scene numbers. Every value is a placeholder chosen for the demo scene; none is ported from a
 * design number yet. When a design value replaces one, name its source here.
 */

/** Orthographic camera zoom in pixels per world metre. */
export const CAMERA_ZOOM = 48

/** Camera sits in front of the XY plane and looks down -Z. */
export const CAMERA_POSITION: readonly [number, number, number] = [0, 0, 20]

/** Placeholder vehicle: a 1×1 m square (design doc section 9 art comes later). */
export const VEHICLE_SIZE = 1
export const VEHICLE_START: readonly [number, number] = [0, 2]

/** Placeholder ground slab under the vehicle: centre y, half width, half height. */
export const GROUND_CENTRE_Y = -3
export const GROUND_HALF_WIDTH = 12
export const GROUND_HALF_HEIGHT = 0.5

/** Horizontal drive tuning for the placeholder vehicle (m/s and m/s²). */
export const VEHICLE_DRIVE = { maxSpeed: 6, acceleration: 24 } as const
