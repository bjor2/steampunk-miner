/**
 * The pause menu's first page drawn from its view model (ticket 404): Resume, Save game and
 * Settings on one shared Title+OneLine element over its controls (spec #422, pass #429). Save game
 * opens the Ledger on the base sheet (ticket 688), which draws the save page, so the plate gives
 * way while the menu is on it. Markup only.
 */
import type { PauseMenuModel } from '../../systems/views/pauseMenuModel'
import { TitleOneLine } from '../kit/TitleOneLine'
import { UI_IDS } from '../ids'
import { ScreenButtonView } from '../ScreenButtonView'
import styles from './PauseMenu.module.css'
import { PAUSED_TEXT } from './pauseMenuElements'

export function PauseMenuView({ model, focusedId }: { model: PauseMenuModel; focusedId: string }) {
  if (model.page === 'save') return null
  return (
    <div className={styles.overlay} data-testid={UI_IDS.pauseMenu} data-page={model.page}>
      <section className={styles.plate}>
        <TitleOneLine text={PAUSED_TEXT} level="h2">
          <div className={styles.choices}>
            <ScreenButtonView button={model.resume} focusedId={focusedId} />
            <ScreenButtonView button={model.saveGame} focusedId={focusedId} />
            <ScreenButtonView button={model.settings} focusedId={focusedId} />
          </div>
          <Notice text={model.notice} />
        </TitleOneLine>
      </section>
    </div>
  )
}

function Notice({ text }: { text: string }) {
  if (text === '') return null
  return (
    <p className={styles.notice} data-testid={UI_IDS.pauseNotice} role="status">
      {text}
    </p>
  )
}
