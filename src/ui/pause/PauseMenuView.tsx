/**
 * The pause menu drawn from its view model (ticket 404): Resume, Save game and Settings, or the
 * save page with the name field, one row per manual slot, the notice line and Back. Markup only.
 */
import type { PauseMenuModel, SaveSlotRow } from '../../systems/views/pauseMenuModel'
import { Panel } from '../kit/Panel'
import { UI_ID_TEMPLATES, UI_IDS } from '../ids'
import { ScreenButtonView } from '../ScreenButtonView'
import styles from './PauseMenu.module.css'

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
      {model.page === 'main' ? (
        <MainPage model={model} focusedId={focusedId} />
      ) : (
        <SavePage model={model} focusedId={focusedId} onSaveNameChange={onSaveNameChange} />
      )}
    </div>
  )
}

function MainPage({ model, focusedId }: { model: PauseMenuModel; focusedId: string }) {
  return (
    <Panel title="Paused">
      <div className={styles.choices}>
        <ScreenButtonView button={model.resume} focusedId={focusedId} />
        <ScreenButtonView button={model.saveGame} focusedId={focusedId} />
        <ScreenButtonView button={model.settings} focusedId={focusedId} />
      </div>
      <Notice text={model.notice} />
    </Panel>
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
    <Panel title="Save game">
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
    </Panel>
  )
}

function SlotLine({ row, focusedId }: { row: SaveSlotRow; focusedId: string }) {
  return (
    <li
      className={styles.slot}
      data-testid={UI_ID_TEMPLATES.pauseSlot(row.slot)}
      data-empty={row.isEmpty || undefined}
    >
      <span className={styles.slotTitle}>{row.title}</span>
      <span>{row.detailText}</span>
      <span>{savedAtTextOf(row.savedAtMs)}</span>
      <ScreenButtonView button={row.button} focusedId={focusedId} />
    </li>
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
