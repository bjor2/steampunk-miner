/**
 * The aim a drag on the fire tile makes, and the line the reticle draws (ticket 314; the touch
 * input of #309's aim amendment). Presentation maths in floats: the drag in screen pixels turns
 * into the rig's own frame through where the rig's right and up point on screen this frame (the
 * camera may roll and the rig may lean), and the reticle runs from the rig's centre along the
 * bearing the shot will really take, as far as the gun reaches.
 */
import { boreDirectionOf } from '../../../../systems/authority/bore/boreAim'
import type { RigAim } from '../fireAim'

export interface PlaneVector {
  x: number
  y: number
}

/** In the table's frame an up of +y: a bearing's direction is `(along, -down)`. */
const TABLE_UP = { x: 0, y: 1 }

/** Whether the drag went far enough from the press to aim, not just tap. */
export function isDragAiming(drag: PlaneVector, aimPixels: number): boolean {
  return drag.x * drag.x + drag.y * drag.y >= aimPixels * aimPixels
}

/**
 * The drag as an aim in the rig's frame: solve `drag = along * right - down * up` with `right`
 * and `up` the rig's axes as drawn on screen.
 */
export function rigAimOfDrag(drag: PlaneVector, right: PlaneVector, up: PlaneVector): RigAim {
  const determinant = right.x * up.y - right.y * up.x
  if (determinant === 0) return { along: 0, down: 0 }
  const along = (drag.x * up.y - drag.y * up.x) / determinant
  const upward = (right.x * drag.y - right.y * drag.x) / determinant
  return { along, down: -upward }
}

/** The rig's right-hand tangent for its up vector, as `boreDirectionOf` reads the facing. */
export function rightOfUp(up: PlaneVector): PlaneVector {
  return { x: up.y, y: -up.x }
}

/** Where the reticle ends in the world: `rangeCells` metres from the centre along the bearing. */
export function reticleEndOf(
  centre: PlaneVector,
  up: PlaneVector,
  bearing: number,
  rangeCells: number,
): PlaneVector {
  const inTable = boreDirectionOf(TABLE_UP, bearing)
  const length = Math.hypot(inTable.x, inTable.y)
  const along = (inTable.x / length) * rangeCells
  const down = (-inTable.y / length) * rangeCells
  const right = rightOfUp(up)
  return {
    x: centre.x + along * right.x - down * up.x,
    y: centre.y + along * right.y - down * up.y,
  }
}
