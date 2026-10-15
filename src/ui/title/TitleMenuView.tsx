/**
 * The title menu drawn from its view model (ticket 403): the main page's three choices, the slot
 * list with each save's name, planet, playtime and wall time, or the New Game confirm, and the
 * problems of a refused load on any page. Every text sits on the shared Title+OneLine element
 * (spec #422, pass #429), the game's name heading the page, and the plate scrolls in the shared
 * scroll area. Markup only.
 */
import {
  TITLE_MENU_ID_TEMPLATES,
  TITLE_MENU_IDS,
  type TitleMenuModel,
  type TitleSlotRow,
} from '../../systems/views/titleMenuModel'
import { ScrollArea } from '../kit/ScrollArea'
import { TitleOneLine } from '../kit/TitleOneLine'
import { ScreenButtonView } from '../ScreenButtonView'
import styles from './TitleMenu.module.css'
import {
  GAME_NAME_TEXT,
  LOAD_REFUSED_TEXT,
  NEW_GAME_CONFIRM_TEXT,
  NEW_GAME_FACTS,
  titleSlotFactsOf,
  titleSlotTextOf,
} from './titleMenuElements'

interface PageProps {
  model: TitleMenuModel
  focusedId: string
}

export function TitleMenuView({ model, focusedId }: PageProps) {
  return (
    <div className={styles.screen} data-testid={TITLE_MENU_IDS.titleMenu} data-page={model.page}>
      <TitleOneLine text={GAME_NAME_TEXT} level="h1">
        <section className={styles.plate}>
          <ScrollArea className={styles.plateScroll}>
            {model.page === 'main' && <MainPage model={model} focusedId={focusedId} />}
            {model.page === 'load' && <LoadPage model={model} focusedId={focusedId} />}
            {model.page === 'confirmNewGame' && <ConfirmPage model={model} focusedId={focusedId} />}
            <LoadProblems problems={model.problems} />
          </ScrollArea>
        </section>
      </TitleOneLine>
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
    <li data-testid={TITLE_MENU_ID_TEMPLATES.slotRow(row.slot)}>
      <TitleOneLine
        text={titleSlotTextOf(row)}
        facts={titleSlotFactsOf(row)}
        level="span"
        layout="row"
        isTooltipHeldOpen={focusedId === row.load.id}
      >
        <ScreenButtonView button={row.load} focusedId={focusedId} />
      </TitleOneLine>
    </li>
  )
}

function ConfirmPage({ model, focusedId }: PageProps) {
  return (
    <TitleOneLine text={NEW_GAME_CONFIRM_TEXT} facts={NEW_GAME_FACTS} level="span">
      <div className={styles.choices}>
        <ScreenButtonView button={model.confirmNewGame} focusedId={focusedId} />
        <ScreenButtonView button={model.cancelNewGame} focusedId={focusedId} />
      </div>
    </TitleOneLine>
  )
}

function LoadProblems({ problems }: { problems: readonly string[] }) {
  if (problems.length === 0) return null
  return (
    <TitleOneLine text={LOAD_REFUSED_TEXT} level="span">
      <ul className={styles.problems} data-testid={TITLE_MENU_IDS.problems}>
        {problems.map((problem) => (
          <li key={problem}>{problem}</li>
        ))}
      </ul>
    </TitleOneLine>
  )
}
