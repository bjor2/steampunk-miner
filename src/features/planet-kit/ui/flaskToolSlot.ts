/**
 * The Damp Flask on the tool slot bar (ticket 881; the TD's seam on #850: one host command in an
 * overflow bar slot): a tap of `use_kit_tool`, as U is, at position 12, past the kernel's charge
 * and guns cells, so it waits in the desktop overflow and the phone tray. Its anchor is the
 * flask's schedule row, and its face shows only while a flask is carried (`flaskToolFaceOf`).
 */
import type { ToolSlotRow } from '../../../ui/registries/toolSlots'
import { USE_KIT_TOOL_ACTION } from '../systems/flaskReaction'
import { flaskToolFaceOf } from '../systems/flaskTile'

const FLASK_POSITION = 12

export const FLASK_TOOL_SLOT: ToolSlotRow = {
  id: 'planet-kit.damp_flask',
  anchor: { row: 'damp_flask' },
  touch: { gesture: 'tap', action: USE_KIT_TOOL_ACTION },
  position: FLASK_POSITION,
  faceOf: flaskToolFaceOf,
}
