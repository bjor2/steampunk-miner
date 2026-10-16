/**
 * "This device can't run the game" (ticket 477, TD #470 section 2.3 (iii)): a GPU under the hard
 * minimum (`gpuTier.ts`: under 12 texture units or 2048 px textures) shows this plain card over
 * the stage instead of a black canvas. Shown by the render pipeline's probe, once; nothing pauses.
 */
import { useGameStore } from '../../store/gameStore'
import { Panel } from '../kit/Panel'
import { DEVICE_UI_IDS } from './deviceIds'
import styles from './UnsupportedDeviceCard.module.css'

export function UnsupportedDeviceCard() {
  const isShown = useGameStore((state) => state.isUnsupportedDeviceCardShown)
  if (!isShown) return null
  return (
    <div className={styles.overlay} data-testid={DEVICE_UI_IDS.unsupportedDeviceCard}>
      <Panel title="This device can't run the game">
        <p className={styles.text}>
          Its graphics chip is short of what Steampunk Miner needs to draw the ground.
        </p>
      </Panel>
    </div>
  )
}
