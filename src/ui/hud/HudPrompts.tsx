/**
 * Bottom centre (#33 section 5): the dock prompt exactly when the authority would accept a dock,
 * the artefact cache prompt exactly when it would open the cache (#46), "Scenario ready" while a
 * scenario waits for play (ticket 301), and the "DEBUG RUN" mark once a debug command was
 * accepted (#11). Each is one shared Title+OneLine element (spec #422, pass #428): the key before
 * the colon is the title, what it does the one line.
 */
import { calloutTextOf, readoutTextOf } from '../../systems/views/hudCallouts'
import type { HudModel } from '../../systems/views/hudModel'
import { UI_IDS } from '../ids'
import { TitleOneLine } from '../kit/TitleOneLine'
import styles from './Hud.module.css'

export function HudPrompts({ model }: { model: HudModel }) {
  return (
    <div className={styles.prompts}>
      {model.dockPrompt.isShown && (
        <Prompt id="hud.prompt.dock" testId={UI_IDS.hudDockPrompt} text={model.dockPrompt.text} />
      )}
      {model.cachePrompt.isShown && (
        <Prompt
          id="hud.prompt.cache"
          testId={UI_IDS.hudCachePrompt}
          text={model.cachePrompt.text}
        />
      )}
      {model.readyPrompt.isShown && (
        <Prompt
          id="hud.prompt.ready"
          testId={UI_IDS.hudReadyPrompt}
          text={model.readyPrompt.text}
        />
      )}
      {model.isDebugRun && (
        <div className={styles.debugMark} data-testid={UI_IDS.hudDebugMark}>
          <TitleOneLine text={readoutTextOf('hud.debug-run', 'DEBUG RUN')} level="span" />
        </div>
      )}
    </div>
  )
}

function Prompt({ id, testId, text }: { id: string; testId: string; text: string }) {
  return (
    <div className={styles.prompt} data-testid={testId}>
      <TitleOneLine text={calloutTextOf(id, text)} level="span" layout="row" />
    </div>
  )
}
