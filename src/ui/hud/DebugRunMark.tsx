/**
 * The "DEBUG RUN" mark (#11): once a debug command was accepted the run says so on screen, so a
 * shot of it is never read as play. Since ticket 684 it stands on its own under the strip's left
 * end instead of in the prompts' row: it marks the run, not the player's HUD, so like the debug
 * flag badge (ticket 549) it carries no `data-hud` box and takes no tap.
 */
import { readoutTextOf } from '../../systems/views/hudCallouts'
import { UI_IDS } from '../ids'
import { TitleOneLine } from '../kit/TitleOneLine'
import styles from './Hud.module.css'

const DEBUG_RUN_TEXT = readoutTextOf('hud.debug-run', 'DEBUG RUN')

export function DebugRunMark() {
  return (
    <div className={styles.debugMark} data-testid={UI_IDS.hudDebugMark}>
      <TitleOneLine text={DEBUG_RUN_TEXT} level="span" />
    </div>
  )
}
