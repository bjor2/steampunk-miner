/**
 * Bottom centre (#33 section 5): the dock prompt exactly when the authority would accept a dock,
 * the artefact cache prompt exactly when it would open the cache (#46), "Scenario ready" while a
 * scenario waits for play (ticket 301), and the "DEBUG RUN" mark once a debug command was
 * accepted (#11).
 */
import type { HudModel } from '../../systems/views/hudModel'
import { UI_IDS } from '../ids'
import styles from './Hud.module.css'

export function HudPrompts({ model }: { model: HudModel }) {
  return (
    <div className={styles.prompts}>
      {model.dockPrompt.isShown && (
        <span className={styles.prompt} data-testid={UI_IDS.hudDockPrompt}>
          {model.dockPrompt.text}
        </span>
      )}
      {model.cachePrompt.isShown && (
        <span className={styles.prompt} data-testid={UI_IDS.hudCachePrompt}>
          {model.cachePrompt.text}
        </span>
      )}
      {model.readyPrompt.isShown && (
        <span className={styles.prompt} data-testid={UI_IDS.hudReadyPrompt}>
          {model.readyPrompt.text}
        </span>
      )}
      {model.isDebugRun && (
        <span className={styles.debugMark} data-testid={UI_IDS.hudDebugMark}>
          DEBUG RUN
        </span>
      )}
    </div>
  )
}
