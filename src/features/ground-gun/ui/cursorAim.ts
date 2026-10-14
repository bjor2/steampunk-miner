/**
 * Where the fire key aims the bore gun (ticket 314): the gamepad's right stick while it leaves its
 * deadzone (ticket 346's `readPadAim`, in screen directions), else the mouse cursor's offset from
 * the rig on the canvas (ticket 345's `Shell.readPointer`). Either is a screen vector read in the
 * rig's own axes as drawn this frame, the same way a drag on the touch tile is read. No
 * screen-to-world helper: both ends are canvas pixels.
 */
import { getShell } from '../../../shell/shell'
import { readPadAim } from '../../../store/padRuntime'
import { rigAimOfDrag, type PlaneVector } from '../systems/render/aimOnScreen'
import type { RigAim } from '../systems/fireAim'
import { rigOnScreen, type RigOnScreen } from './rigOnScreen'

/** Null with no stick or mouse aiming, or the rig off screen: the shot goes along the facing. */
export function readCursorAim(): RigAim | null {
  const rig = rigOnScreen()
  if (rig === null) return null
  const screenAim = readPadAim() ?? cursorOffsetFrom(rig)
  return screenAim === null ? null : rigAimOfDrag(screenAim, rig.right, rig.up)
}

function cursorOffsetFrom(rig: RigOnScreen): PlaneVector | null {
  const pointer = getShell().readPointer()
  if (pointer === null) return null
  return { x: pointer.x - rig.centre.x, y: pointer.y - rig.centre.y }
}
