/**
 * The kernel's own touch controls as binding rows (#474), read before the slices' rows: the
 * floating stick's four drive actions, the cluster's buttons (`touchControls.ts`, #173), the tool
 * slot bar's kernel cells, Plant charge, its size step (ticket 473) and the guns toggle (ticket
 * 691), the pause button (ticket 472), the stage's double tap, and the
 * actions the kernel leaves with no touch control, each with its reason.
 */
import type { ActionId } from './actionMap'
import { KERNEL_TOOL_SLOT_RULES } from './toolSlots'
import { CLUSTER_ACTION_IDS, PAUSE_ACTION_ID } from './touchControls'
import type { TouchBindingRule } from './touchBindings'

const STICK_ACTION_IDS = ['lift', 'aim_down', 'aim_left', 'aim_right'] as const

/** Focus moves for keys and pads; a finger taps the control itself. */
const MENU_FOCUS_ACTION_IDS = ['ui_up', 'ui_down', 'ui_left', 'ui_right'] as const

export const KERNEL_TOUCH_BINDINGS: readonly TouchBindingRule[] = [
  ...STICK_ACTION_IDS.map((action) => rowOf(`stick_${action}`, { gesture: 'drag', action })),
  ...CLUSTER_ACTION_IDS.map((action) => rowOf(`cluster_${action}`, { gesture: 'tap', action })),
  ...KERNEL_TOOL_SLOT_RULES.map(({ id, anchor, touch }) => ({ id, anchor, touch })),
  rowOf('pause_button', { gesture: 'tap', action: PAUSE_ACTION_ID }),
  rowOf('double_tap_zoom_reset', { gesture: 'tap', action: 'zoom_reset' }),
  ...MENU_FOCUS_ACTION_IDS.map((action) =>
    noControlRow(action, 'a finger taps the control itself, so focus never moves'),
  ),
  noControlRow('ui_confirm', 'a tap on a control presses it, as the key presses the focused one'),
  noControlRow(
    'ui_cancel',
    'every layer draws its own Back, Close, Leave, Resume or Undock button for a tap',
  ),
]

function rowOf(control: string, touch: TouchBindingRule['touch']): TouchBindingRule {
  return { id: `kernel.${control}`, anchor: 'kernel', touch }
}

function noControlRow(action: ActionId, reason: string): TouchBindingRule {
  return { ...rowOf(`no_touch_${action}`, { gesture: 'none', action }), reason }
}
