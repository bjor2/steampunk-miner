/**
 * The stage (#173): the canvas fills it, and the HUD and screens lay out in its safe area, so a
 * pillarboxed 32:9 screen keeps the UI over the picture and TV mode keeps it clear of overscan.
 * Markup only; the sizes come from the root's custom properties the shell writes.
 */
import type { ReactNode } from 'react'
import { DEVICE_UI_IDS } from './deviceIds'
import styles from './GameStage.module.css'

export function GameStage({ scene, children }: { scene: ReactNode; children: ReactNode }) {
  return (
    <div className={styles.stage} data-testid={DEVICE_UI_IDS.gameStage}>
      {scene}
      <div className={styles.safeArea} data-testid={DEVICE_UI_IDS.safeArea}>
        {children}
      </div>
    </div>
  )
}
