/**
 * The number keys on a turned tool tray (spec #678, ticket 768; the HS on the GD lock of 23 Oct:
 * hotkeys apply to the current page). On the thumb cells a number key presses what it is bound
 * to, as ever; once the overflow cell turned the tray, Digit n presses the tool the page shows in
 * cell n, through that tool's own action, so the action stream reads as a tap on the cell would,
 * and nothing over an empty well. The page and the tools are the ones the bar draws now.
 */
import type { ActionId } from '../systems/input/actionMap'
import { actionOfToolRule, cellOfHotkey } from '../systems/input/toolSlots'
import { layoutKindOf, type LayoutKind } from '../systems/views/designSystem'
import { toolInCellOf } from '../systems/views/toolSlotBar'
import { toolSlotRowOf } from '../ui/registries/toolSlots'
import { readFittedScreen } from '../ui/stage/screenFit'
import { readShownTools } from '../ui/toolSlots/toolSlotReads'
import { useGameStore } from './gameStore'

/** The actions a key presses on the tray page shown; null when the key's own binding answers. */
export function toolActionsOnTurnedTray(code: string): ActionId[] | null {
  const page = useGameStore.getState().toolTrayPage
  const cell = cellOfHotkey(code)
  if (page === 0 || cell === null) return null
  const tool = toolInCellOf(readShownTools(), layoutKindNow(), page, cell)
  return tool === null ? [] : actionsOfRow(tool.rowId)
}

function actionsOfRow(rowId: string): ActionId[] {
  const row = toolSlotRowOf(rowId)
  return row === null ? [] : [actionOfToolRule(row)]
}

/** The layout the shell last fitted; the desktop bar before the first fit, as the HUD draws it. */
function layoutKindNow(): LayoutKind {
  return layoutKindOf(readFittedScreen()?.hudDensity ?? 'full')
}
