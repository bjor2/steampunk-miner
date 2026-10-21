/**
 * The pause menu drawn from its view model (ticket 404): Resume, Save game and Settings, or the
 * save page with the name field, one row per manual slot, the notice line and Back. Each page is
 * one shared Title+OneLine element over its controls (spec #422, pass #429), and the slots scroll
 * in the shared scroll area. A saved slot's Scrap, once pressed, asks its question under the row
 * with Scrap and Keep (ticket 704). Markup only.
 */
import type { PauseMenuModel, SaveSlotRow, ScrapConfirm } from '../../systems/views/pauseMenuModel'
import { ScrollArea } from '../kit/ScrollArea'
import { TitleOneLine } from '../kit/TitleOneLine'
import { UI_ID_TEMPLATES, UI_IDS } from '../ids'
import { ScreenButtonView } from '../ScreenButtonView'
import styles from './PauseMenu.module.css'
import { PAUSED_TEXT, pauseSlotFactsOf, pauseSlotTextOf, SAVE_PAGE_TEXT } from './pauseMenuElements'

export function PauseMenuView({
  model,
  focusedId,
  onSaveNameChange,
}: {
  model: PauseMenuModel
  focusedId: string
  onSaveNameChange: (name: string) => void
}) {
  return (
    <div className={styles.overlay} data-testid={UI_IDS.pauseMenu} data-page={model.page}>
      <section className={styles.plate}>
        {model.page === 'main' ? (
          <MainPage model={model} focusedId={focusedId} />
        ) : (
          <SavePage model={model} focusedId={focusedId} onSaveNameChange={onSaveNameChange} />
        )}
      </section>
    </div>
  )
}

function MainPage({ model, focusedId }: { model: PauseMenuModel; focusedId: string }) {
  return (
    <TitleOneLine text={PAUSED_TEXT} level="h2">
      <div className={styles.choices}>
        <ScreenButtonView button={model.resume} focusedId={focusedId} />
        <ScreenButtonView button={model.saveGame} focusedId={focusedId} />
        <ScreenButtonView button={model.settings} focusedId={focusedId} />
      </div>
      <Notice text={model.notice} />
    </TitleOneLine>
  )
}

function SavePage({
  model,
  focusedId,
  onSaveNameChange,
}: {
  model: PauseMenuModel
  focusedId: string
  onSaveNameChange: (name: string) => void
}) {
  return (
    <TitleOneLine text={SAVE_PAGE_TEXT} level="h2">
      <label className={styles.name} data-testid={UI_IDS.pauseSaveName}>
        Name
        <input
          className={styles.nameField}
          type="text"
          value={model.saveName}
          maxLength={model.saveNameMaxChars}
          onChange={(event) => onSaveNameChange(event.target.value)}
        />
      </label>
      <ScrollArea className={styles.slotsScroll}>
        <ol className={styles.slots}>
          {model.slots.map((row) => (
            <SlotLine key={row.slot} row={row} focusedId={focusedId} />
          ))}
        </ol>
      </ScrollArea>
      <Notice text={model.notice} />
      <ScreenButtonView button={model.back} focusedId={focusedId} />
    </TitleOneLine>
  )
}

function SlotLine({ row, focusedId }: { row: SaveSlotRow; focusedId: string }) {
  return (
    <li
      className={styles.slot}
      data-testid={UI_ID_TEMPLATES.pauseSlot(row.slot)}
      data-empty={row.isEmpty || undefined}
    >
      <TitleOneLine
        text={pauseSlotTextOf(row, savedAtTextOf(row.savedAtMs))}
        facts={pauseSlotFactsOf(row)}
        level="span"
        layout="row"
        isTooltipHeldOpen={focusedId === row.button.id}
      >
        <SlotButtons row={row} focusedId={focusedId} />
      </TitleOneLine>
      {row.scrapConfirm && (
        <ScrapQuestion slot={row.slot} confirm={row.scrapConfirm} focusedId={focusedId} />
      )}
    </li>
  )
}

/** While the row asks, its own buttons give way to the question's two. */
function SlotButtons({ row, focusedId }: { row: SaveSlotRow; focusedId: string }) {
  if (row.scrapConfirm) return null
  return (
    <div className={styles.slotButtons}>
      <ScreenButtonView button={row.button} focusedId={focusedId} />
      {row.scrap && <ScreenButtonView button={row.scrap} focusedId={focusedId} />}
    </div>
  )
}

function ScrapQuestion({
  slot,
  confirm,
  focusedId,
}: {
  slot: SaveSlotRow['slot']
  confirm: ScrapConfirm
  focusedId: string
}) {
  return (
    <div className={styles.scrapQuestion} role="alertdialog" aria-label={confirm.question}>
      <p className={styles.question} data-testid={UI_ID_TEMPLATES.pauseSlotScrapQuestion(slot)}>
        {confirm.question}
      </p>
      <div className={styles.slotButtons}>
        <ScreenButtonView button={confirm.scrap} focusedId={focusedId} />
        <ScreenButtonView button={confirm.keep} focusedId={focusedId} />
      </div>
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

/** The player's local time zone is the browser's to know, so the wall time is formatted here. */
function savedAtTextOf(savedAtMs: number | null): string {
  return savedAtMs === null ? '' : new Date(savedAtMs).toLocaleString()
}
