/**
 * The tool slot bar (spec #678 HS kinds, ticket 691; docs/ui/design-system.md sections 9 and 10):
 * the HUD's one grid in the thumb's corner. On a phone 4 thumb cells, the overflow cell and the
 * gear, a 3x2 grid upright standing on the touch cluster's row, one row of 6 sideways left of
 * Interact; on desktop 8 cells pressed by Digit1-8, the overflow cell and the gear in one row at
 * the bottom right, lifted over the cluster while the touch controls show. Every cell is drawn by
 * the kernel (`ToolCell`); a row's own cell adds what rides it. The overflow cell turns the cells
 * through the tray in place. With no tool shown only the gear is drawn. Mirrored for the left hand.
 */
import { useState } from 'react'
import { useGameStore } from '../../store/gameStore'
import { DESIGN_TOKENS, type LayoutKind } from '../../systems/views/designSystem'
import {
  nextTrayPageOf,
  toolBarLayoutOf,
  type ShownTool,
  type ToolBarLayout,
} from '../../systems/views/toolSlotBar'
import { HudGearButton } from '../hud/HudGearButton'
import { UI_IDS } from '../ids'
import { useScreenModel } from '../useScreenModel'
import { OverflowCell } from './OverflowCell'
import { ShownToolCell } from './ShownToolCell'
import { readShownTools } from './toolSlotReads'
import styles from './ToolSlotBar.module.css'

interface ToolSlotBarProps {
  kind: LayoutKind
  isDetailOpen: boolean
  isLeftHanded: boolean
  /** The bar rises over the touch gesture surface while it lies over the HUD (ticket 684). */
  isRaised: boolean
}

export function ToolSlotBar(props: ToolSlotBarProps) {
  const tools = useScreenModel(readShownTools)
  const isOverCluster = useGameStore((state) => state.isTouchControlsShown)
  return <ToolSlotBarView {...props} tools={tools} isOverCluster={isOverCluster} />
}

/** The bar for these tools; a server render draws it from props alone. */
export function ToolSlotBarView({
  tools,
  kind,
  isDetailOpen,
  isLeftHanded,
  isRaised,
  isOverCluster,
}: ToolSlotBarProps & { tools: readonly ShownTool[]; isOverCluster: boolean }) {
  const [page, setPage] = useState(0)
  const layout = toolBarLayoutOf(tools, kind, page)
  return (
    <div
      className={styles.bar}
      data-testid={layout === null ? undefined : UI_IDS.hudToolSlots}
      data-hand={isLeftHanded ? 'left' : 'right'}
      data-raised={isRaised || undefined}
      data-over-cluster={isOverCluster || undefined}
    >
      <ToolCells layout={layout} kind={kind} onTurnTray={setPage} />
      <HudGearButton isOpen={isDetailOpen} />
    </div>
  )
}

/** The slot cells and the overflow cell, or their empty wells, so the gear keeps its cell. */
function ToolCells({
  layout,
  kind,
  onTurnTray,
}: {
  layout: ToolBarLayout | null
  kind: LayoutKind
  onTurnTray: (page: number) => void
}) {
  const cells = layout?.cells ?? emptyCellsOf(kind)
  const tray = layout?.tray ?? null
  return (
    <>
      {cells.map((tool, index) =>
        tool === null ? (
          <span key={`well-${index}`} className={styles.well} />
        ) : (
          <ShownToolCell key={tool.rowId} tool={tool} />
        ),
      )}
      {tray === null ? (
        <span className={styles.well} />
      ) : (
        <OverflowCell tray={tray} onTurn={() => onTurnTray(nextTrayPageOf(tray))} />
      )}
    </>
  )
}

function emptyCellsOf(kind: LayoutKind): null[] {
  return Array.from({ length: DESIGN_TOKENS.layout.toolSlots.count[kind] }, () => null)
}
