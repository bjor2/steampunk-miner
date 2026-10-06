/**
 * "Turn your device" (#173): the game plays in landscape only, so portrait shows this card over
 * the stage. Shown and hidden by the orientation alone (its style sheet), so rotating back
 * dismisses it without a reload and nothing pauses.
 */
import { Panel } from '../kit/Panel'
import { DEVICE_UI_IDS } from './deviceIds'
import styles from './PortraitCard.module.css'

export function PortraitCard() {
  return (
    <div className={styles.overlay} data-testid={DEVICE_UI_IDS.portraitCard}>
      <Panel title="Turn your device">
        <span className={styles.glyph} aria-hidden>
          &#x27F3;
        </span>
        <p className={styles.text}>Steampunk Miner plays in landscape.</p>
      </Panel>
    </div>
  )
}
