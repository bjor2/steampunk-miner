/**
 * The desktop dock beside the play view (spec #678, ticket 686; GD lock, 21 Oct: panels dock
 * beside the view instead of covering it): the docked sheet, or the star map's panel while no
 * sheet holds the dock (ticket 769). While either is drawn, the sheet's closing included, the
 * stage narrows by the dock's width (`--sheet-docked-width` on the root, which the stage
 * subtracts) and the sheet fills the column that frees, so the canvas, the HUD and the camera
 * re-fit to the narrower view and nothing covers it. The width is at most a quarter of the stage
 * (ticket 767), refitted on a resize. The one writer of `--sheet-docked-width`: the stage narrows
 * when the first panel draws and widens when the last one goes, so a sheet sliding out over the
 * star map leaves the view narrowed.
 */
import { useEffect } from 'react'
import { getShell } from '../../shell/shell'
import { StarMapPanel } from '../starMap/StarMapPanel'
import { BaseSheet } from './BaseSheet'
import styles from './SheetDock.module.css'
import { SHEET_UI_IDS } from './sheetIds'
import { useSheetDockWidth } from './useSheetPlacement'

const DOCKED_WIDTH = '--sheet-docked-width'

/** How many of the dock's panels are drawn now. */
let drawnPanels = 0

export function SheetDock() {
  return (
    <aside className={styles.dock} data-testid={SHEET_UI_IDS.sheetDock}>
      <BaseSheet at="docked">
        <StageNarrowing />
      </BaseSheet>
      <StarMapPanel>
        <StageNarrowing />
      </StarMapPanel>
    </aside>
  )
}

function StageNarrowing() {
  const widthPx = useSheetDockWidth()
  useEffect(() => narrowStageWhileDrawn(widthPx), [widthPx])
  return null
}

/** Narrows the stage now; returns the call that gives the view its width back. */
function narrowStageWhileDrawn(widthPx: number): () => void {
  drawnPanels += 1
  getShell().setScreenStyle({ [DOCKED_WIDTH]: `${widthPx}px` })
  return widenStageAfterLastPanel
}

function widenStageAfterLastPanel(): void {
  drawnPanels -= 1
  if (drawnPanels === 0) getShell().setScreenStyle({ [DOCKED_WIDTH]: '0px' })
}
