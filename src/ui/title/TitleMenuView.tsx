/**
 * The title menu drawn from its view model (ticket 403): the main page's three choices, the slot
 * list with each save's name, planet, playtime and wall time, or the New Game confirm, and the
 * problems of a refused load on any page. Markup only.
 */
import {
  TITLE_MENU_ID_TEMPLATES,
  TITLE_MENU_IDS,
  type TitleMenuModel,
  type TitleSlotRow,
} from '../../systems/views/titleMenuModel'
import { ScreenButtonView } from '../ScreenButtonView'
import styles from './TitleMenu.module.css'

interface PageProps {
  model: TitleMenuModel
  focusedId: string
}

export function TitleMenuView({ model, focusedId }: PageProps) {
  return (
    <div className={styles.screen} data-testid={TITLE_MENU_IDS.titleMenu} data-page={model.page}>
      <h1 className={styles.gameTitle}>Steampunk Miner</h1>
      <section className={styles.plate}>
        {model.page === 'main' && <MainPage model={model} focusedId={focusedId} />}
        {model.page === 'load' && <LoadPage model={model} focusedId={focusedId} />}
        {model.page === 'confirmNewGame' && <ConfirmPage model={model} focusedId={focusedId} />}
        {model.problems.length > 0 && (
          <ul className={styles.problems} data-testid={TITLE_MENU_IDS.problems}>
            {model.problems.map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function MainPage({ model, focusedId }: PageProps) {
  return (
    <div className={styles.choices}>
      <ScreenButtonView button={model.continueGame} focusedId={focusedId} />
      {model.continueSummary !== null && (
        <p className={styles.summary} data-testid={TITLE_MENU_IDS.continueSummary}>
          {model.continueSummary}
        </p>
      )}
      <ScreenButtonView button={model.newGame} focusedId={focusedId} />
      <ScreenButtonView button={model.load} focusedId={focusedId} />
    </div>
  )
}

function LoadPage({ model, focusedId }: PageProps) {
  return (
    <div className={styles.choices}>
      <ol className={styles.slotList} data-testid={TITLE_MENU_IDS.slotList}>
        {model.slotRows.map((row) => (
          <SlotLine key={row.slot} row={row} focusedId={focusedId} />
        ))}
      </ol>
      <ScreenButtonView button={model.back} focusedId={focusedId} />
    </div>
  )
}

function SlotLine({ row, focusedId }: { row: TitleSlotRow; focusedId: string }) {
  return (
    <li className={styles.slot} data-testid={TITLE_MENU_ID_TEMPLATES.slotRow(row.slot)}>
      <span className={styles.slotName}>{row.name}</span>
      <span>{row.planetText}</span>
      <span>{row.playtimeText}</span>
      <span>{row.savedAtText}</span>
      <ScreenButtonView button={row.load} focusedId={focusedId} />
    </li>
  )
}

function ConfirmPage({ model, focusedId }: PageProps) {
  return (
    <div className={styles.choices}>
      <p className={styles.summary}>{model.confirmText}</p>
      <ScreenButtonView button={model.confirmNewGame} focusedId={focusedId} />
      <ScreenButtonView button={model.cancelNewGame} focusedId={focusedId} />
    </div>
  )
}
