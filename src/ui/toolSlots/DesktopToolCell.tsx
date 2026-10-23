/**
 * A tool cell on the desktop bar (spec #678, ticket 768): the row's own cell, the brass tag of the
 * key that presses it, and, while a mouse rests on it, its hover plate (the tool's name, its item's
 * hover line as a phone's long press shows it, its charges in full). The plate only shows: the
 * cell still acts on its press alone, so a tool fires on a click and never on a hover.
 */
import { useGameStore } from '../../store/gameStore'
import type { ShownTool } from '../../systems/views/toolSlotBar'
import { HoverPlate } from '../kit/HoverPlate'
import { KeyTag } from '../kit/KeyTag'
import { useMouseHover } from '../kit/useMouseHover'
import { ShownToolCell } from './ShownToolCell'
import { readToolCellKeyLabel, readToolHoverLines } from './toolSlotReads'
import styles from './ToolSlotBar.module.css'

export function DesktopToolCell({
  tool,
  cell,
  align,
}: {
  tool: ShownTool
  /** The cell's place on the bar, 1 first. */
  cell: number
  /** The plate opens inwards from the bar's outer edge. */
  align: 'start' | 'end'
}) {
  const hover = useMouseHover()
  const keyLabel = useGameStore((state) => readToolCellKeyLabel(state, tool, cell))
  return (
    <div className={styles.keyedCell} {...hover.handlers}>
      <ShownToolCell tool={tool} />
      {keyLabel !== null && <KeyTag label={keyLabel} place="corner" />}
      {hover.isHovered && (
        <HoverPlate id={tool.rowId} lines={readToolHoverLines(tool)} side="above" align={align} />
      )}
    </div>
  )
}
