/**
 * One shown tool's cell: the row's own cell when its press is more than a tap, else the kernel's
 * tap cell pressing the row's action (ticket 691).
 */
import { actionOfToolRule } from '../../systems/input/toolSlots'
import type { ShownTool } from '../../systems/views/toolSlotBar'
import { toolSlotRowOf } from '../registries/toolSlots'
import { TapToolCell } from './TapToolCell'

export function ShownToolCell({ tool }: { tool: ShownTool }) {
  const row = toolSlotRowOf(tool.rowId)
  if (row === null) return null
  const { Cell } = row
  if (Cell !== undefined) return <Cell face={tool.face} />
  return <TapToolCell face={tool.face} action={actionOfToolRule(row)} />
}
