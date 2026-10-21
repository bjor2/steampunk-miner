/**
 * The stage (#173): the canvas fills it, and the HUD and screens lay out in its safe area, so a
 * pillarboxed 32:9 screen keeps the UI over the picture and TV mode keeps it clear of overscan.
 * A desktop dock (ticket 686) sits beside it. Markup only; the sizes come from the root's custom
 * properties the shell writes.
 */
import type { ReactNode } from 'react'
import { DEVICE_UI_IDS } from './deviceIds'
import styles from './GameStage.module.css'

export function GameStage({
  scene,
  dock = null,
  children,
}: {
  scene: ReactNode
  /** Drawn beside the stage, in the column a docked sheet takes off it (ticket 686). */
  dock?: ReactNode
  children: ReactNode
}) {
  return (
    <>
      <div className={styles.stage} data-testid={DEVICE_UI_IDS.gameStage}>
        {scene}
        <div className={styles.safeArea} data-testid={DEVICE_UI_IDS.safeArea}>
          {children}
        </div>
      </div>
      {dock}
    </>
  )
}
