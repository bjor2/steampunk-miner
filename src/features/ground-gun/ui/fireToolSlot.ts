/**
 * The bore gun on the tool slot bar (ticket 691; #474 put its tile on the touch panel first): the
 * gun and its shoring shot (the cementing round, ticket 369) both fire from the one cell, whose
 * drag aims and whose tap fires along the facing, as the fire key does. Position 8, so Digit8
 * fires it on desktop beside the mouse and X. The cell shows nothing until the gun is mounted.
 */
import type { ToolSlotRow } from '../../../ui/registries/toolSlots'
import { BORE_GUN_SCHEDULE_ROW } from '../systems/boreGunContent'
import { fireToolFaceOf } from '../systems/fireTile'
import { FIRE_ACTION } from '../store/fireInput'
import { FireToolCell } from './FireToolCell'

const BORE_GUN_POSITION = 8

export const FIRE_TOOL_SLOT: ToolSlotRow = {
  id: 'ground-gun.bore_gun',
  anchor: { row: BORE_GUN_SCHEDULE_ROW },
  touch: { gesture: 'drag', action: FIRE_ACTION, tapPath: FIRE_ACTION },
  position: BORE_GUN_POSITION,
  faceOf: fireToolFaceOf,
  Cell: FireToolCell,
}
