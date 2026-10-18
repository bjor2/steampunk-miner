/**
 * One flag's row in the debug flag panel (ticket 549): its name and game-like line, a switch, its
 * default, its marks (experimental, pending until the drill is idle, host only, remembered, over
 * the save), its apply rule and pairing note, any pair warning, and a stale default with the
 * offer to drop the override that pins it (VS 4 and 5 on #547). Markup only.
 *
 * The switch is a one-off: the kit's button has no on/off state for assistive tech to read.
 */
import type { MouseEvent } from 'react'
import { useGameStore } from '../../store/gameStore'
import type { DevFlagPanelRow, StaleDefault } from '../../systems/devFlags/devFlagPanelModel'
import { Button } from '../kit/Button'
import { TitleOneLine } from '../kit/TitleOneLine'
import { DEBUG_UI_ID_TEMPLATES } from './debugUiIds'
import styles from './DevFlagPanel.module.css'

export function DevFlagRowView({ row }: { row: DevFlagPanelRow }) {
  return (
    <li
      className={styles.row}
      data-testid={DEBUG_UI_ID_TEMPLATES.devFlagRow(row.id)}
      data-on={row.isOn}
      data-pending={row.isPending || undefined}
      data-read-only={row.isReadOnly || undefined}
    >
      <TitleOneLine text={textOf(row)} level="span">
        <div className={styles.controls}>
          <FlagSwitch row={row} />
          <span className={styles.default}>{row.defaultText}</span>
          <RowMarks row={row} />
        </div>
      </TitleOneLine>
      <code className={styles.flagId}>{row.id}</code>
      <p className={styles.note}>{row.applyRule}</p>
      <p className={styles.note}>{row.pairingRule}</p>
      {row.taintLabel === null ? null : <p className={styles.note}>{row.taintLabel}</p>}
      {row.pairWarnings.map((warning) => (
        <p key={warning} className={styles.warning} role="status">
          {warning}
        </p>
      ))}
      <StaleDefaultLine row={row} staleDefault={row.staleDefault} />
    </li>
  )
}

function FlagSwitch({ row }: { row: DevFlagPanelRow }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={row.isOn}
      aria-label={row.name}
      className={styles.switch}
      disabled={row.isReadOnly}
      data-testid={DEBUG_UI_ID_TEMPLATES.devFlagSwitch(row.id)}
      onMouseDown={keepFocusOnGame}
      onClick={() => flipFlag(row)}
    >
      {row.isOn ? 'On' : 'Off'}
    </button>
  )
}

function RowMarks({ row }: { row: DevFlagPanelRow }) {
  return (
    <>
      {row.isExperimental ? <span className={styles.mark}>Experimental</span> : null}
      {row.isPending ? <span className={styles.mark}>Pending: waits for an idle drill</span> : null}
      {row.isReadOnly ? <span className={styles.mark}>Host only</span> : null}
      {row.isRemembered ? <span className={styles.mark}>Remembered</span> : null}
      {row.isOverSave ? <span className={styles.mark}>Over the save</span> : null}
    </>
  )
}

function StaleDefaultLine({
  row,
  staleDefault,
}: {
  row: DevFlagPanelRow
  staleDefault: StaleDefault | null
}) {
  if (staleDefault === null) return null
  return (
    <p className={styles.warning}>
      {staleDefault.text}
      {staleDefault.isDroppable ? (
        <Button
          label="Drop override"
          onPress={() => dropOverride(row)}
          testId={DEBUG_UI_ID_TEMPLATES.devFlagDrop(row.id)}
        />
      ) : null}
    </p>
  )
}

function textOf(row: DevFlagPanelRow) {
  return { id: `debug.flag.${row.id}`, title: row.name, oneLine: row.line, tooltipLines: [] }
}

function flipFlag(row: DevFlagPanelRow): void {
  useGameStore.getState().chooseDevFlags({ [row.id]: !row.isOn })
}

/** The flag back at its shipped value, which drops the remembered entry. */
function dropOverride(row: DevFlagPanelRow): void {
  useGameStore.getState().chooseDevFlags({ [row.id]: row.isOnByDefault })
}

/** As the kit's button: a click never leaves the switch focused, so keys go back to the game. */
function keepFocusOnGame(event: MouseEvent): void {
  event.preventDefault()
}
