/**
 * The desktop dock beside the play view (spec #678, ticket 686; GD lock, 21 Oct: panels dock
 * beside the view instead of covering it): while the docked sheet is drawn, closing included, the
 * stage narrows by the dock's width (`--sheet-docked-width` on the root, which the stage
 * subtracts) and the sheet fills the column that frees, so the canvas, the HUD and the camera
 * re-fit to the narrower view and nothing covers it. The one writer of `--sheet-docked-width`.
 */
import { useEffect } from 'react'
import { getShell } from '../../shell/shell'
import { BaseSheet } from './BaseSheet'
import styles from './SheetDock.module.css'
import { SHEET_UI_IDS } from './sheetIds'

const DOCKED_WIDTH = '--sheet-docked-width'

export function SheetDock() {
  return (
    <aside className={styles.dock} data-testid={SHEET_UI_IDS.sheetDock}>
      <BaseSheet at="docked">
        <StageNarrowing />
      </BaseSheet>
    </aside>
  )
}

function StageNarrowing() {
  useEffect(narrowStageWhileDrawn, [])
  return null
}

/** Narrows the stage now; returns the call that gives the view its width back. */
function narrowStageWhileDrawn(): () => void {
  getShell().setScreenStyle({ [DOCKED_WIDTH]: 'var(--sheet-dock-width)' })
  return () => getShell().setScreenStyle({ [DOCKED_WIDTH]: '0px' })
}
