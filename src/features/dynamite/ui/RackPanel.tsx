/**
 * The HUD rack panel (#149, `rackPanel.ts`): the selected size with its icon, radius and count,
 * the size key, and the plunger's line while a charge is live. Drawn bottom right in the gauges
 * slot; nothing until the rack is bolted on.
 */
import { useScreenModel } from '../../../ui/useScreenModel'
import { VectorIcon } from '../../../ui/VectorIcon'
import { readRackPanel } from '../store/rackPanelReads'
import styles from './RackPanel.module.css'

export const RACK_PANEL_TEST_ID = 'dynamite-rack'

export function RackPanel() {
  const panel = useScreenModel(readRackPanel)
  if (panel === null) return null
  return (
    <div className={styles.rack} data-testid={RACK_PANEL_TEST_ID} data-size={panel.size}>
      <div className={styles.line}>
        <VectorIcon iconId={panel.iconId} size="hud" />
        <span>{panel.sizeText}</span>
        <span className={styles.count}>×{panel.carried}</span>
      </div>
      {panel.nextSizeText !== null && <div className={styles.hint}>{panel.nextSizeText}</div>}
      {panel.plungerText !== null && <div className={styles.plunger}>{panel.plungerText}</div>}
    </div>
  )
}
