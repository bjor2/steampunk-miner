/**
 * Where the mouse aims the bore gun (ticket 314 on ticket 345's `Shell.readPointer`): the cursor's
 * offset from the rig on the canvas, read in the rig's own axes as drawn this frame, the same way a
 * drag on the touch tile is read. No screen-to-world helper: both ends are canvas pixels.
 */
import { getShell } from '../../../shell/shell'
import { rigAimOfDrag } from '../systems/render/aimOnScreen'
import type { RigAim } from '../systems/fireAim'
import { rigOnScreen } from './rigOnScreen'

/** Null with no mouse over the canvas or the rig off screen: the shot goes along the facing. */
export function readCursorAim(): RigAim | null {
  const pointer = getShell().readPointer()
  const rig = rigOnScreen()
  if (pointer === null || rig === null) return null
  const offset = { x: pointer.x - rig.centre.x, y: pointer.y - rig.centre.y }
  return rigAimOfDrag(offset, rig.right, rig.up)
}
