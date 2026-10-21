/**
 * The Ledger tab of the base sheet (spec #678, ticket 688; the pause menu's save page of ticket 404
 * as was): the name field, one row per manual slot, the notice line and Back, on the shared
 * Title+OneLine element (spec #422, pass #429), in the sheet's one scroll area. It shows exactly
 * while the pause menu is on its save page, so the world holds and the pause slice still owns the
 * save flow and its keys: Escape steps back to the pause menu's first page. A saved slot's Scrap,
 * once pressed, asks its question under the row with Scrap and Keep (ticket 704). Markup only.
 */
import { useGameStore } from '../../store/gameStore'
import { readPauseMenuModel } from '../../store/screenReads'
import { focusOnScreen } from '../../systems/views/menuFocus'
import type { PauseMenuModel, SaveSlotRow, ScrapConfirm } from '../../systems/views/pauseMenuModel'
import { TitleOneLine } from '../kit/TitleOneLine'
import { UI_ID_TEMPLATES, UI_IDS } from '../ids'
import { ScreenButtonView } from '../ScreenButtonView'
import { useScreenModel } from '../useScreenModel'
import styles from './LedgerSheetPanel.module.css'
import { pauseSlotFactsOf, pauseSlotTextOf, SAVE_PAGE_TEXT } from './ledgerElements'

export function LedgerSheetPanel() {
  const model = useScreenModel(readPauseMenuModel)
  const focusedControlId = useGameStore((state) => state.focusedControlId)
  if (model === null) return null
  const focusedId = focusOnScreen(model.focusStops, focusedControlId, model.startFocus)
  return (
    <LedgerView
      model={model}
      focusedId={focusedId}
      onSaveNameChange={useGameStore.getState().setPauseSaveName}
    />
  )
}

export function LedgerView({
  model,
  focusedId,
  onSaveNameChange,
}: {
  model: PauseMenuModel
  focusedId: string
  onSaveNameChange: (name: string) => void
}) {
  return (
    <div className={styles.ledger} data-testid={UI_IDS.ledger}>
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
        <ol className={styles.slots}>
          {model.slots.map((row) => (
            <SlotLine key={row.slot} row={row} focusedId={focusedId} />
          ))}
        </ol>
        <Notice text={model.notice} />
        <ScreenButtonView button={model.back} focusedId={focusedId} />
      </TitleOneLine>
    </div>
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
