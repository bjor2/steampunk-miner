/**
 * Settings drawn from their view model: the display switches, the save file's Export and Import
 * with the note that a trip resumes at the dock (ticket 479), every action with its key, its pad
 * button and a rebind button, the problem lines of a refused rebinding or save file, reset, and
 * close. Each
 * group, row and the footer is one shared Title+OneLine element (spec #422, pass #429), the rows
 * scrolling in the shared scroll area. Markup only.
 */
import {
  SETTINGS_HEADING,
  type BindingRow,
  type SaveFileRow,
  type SettingToggle,
  type SettingsModel,
} from '../../systems/views/settingsModel'
import type { ElementText } from '../../systems/views/uiText'
import { panelIconIdOf } from '../../systems/art/icons/iconSet'
import { Panel } from '../kit/Panel'
import { ScrollArea } from '../kit/ScrollArea'
import { TitleOneLine } from '../kit/TitleOneLine'
import { UI_IDS } from '../ids'
import { ScreenButtonView } from '../ScreenButtonView'
import styles from './Settings.module.css'
import {
  bindingTextOf,
  CONTROLS_GROUP_TEXT,
  DISPLAY_GROUP_TEXT,
  REBIND_REFUSED_TEXT,
  SAVE_FILE_REFUSED_TEXT,
  SAVES_GROUP_TEXT,
  SETTINGS_FOOTER_TEXT,
  toggleTextOf,
} from './settingsElements'

export function SettingsView({ model, focusedId }: { model: SettingsModel; focusedId: string }) {
  return (
    <div className={styles.overlay} data-testid={UI_IDS.settingsPanel}>
      <Panel title="Settings" iconId={panelIconIdOf('settings')} heading={SETTINGS_HEADING}>
        <ScrollArea className={styles.scroll}>
          <div className={styles.columns}>
            <div>
              <TitleOneLine text={DISPLAY_GROUP_TEXT} level="span">
                {model.toggles.map((toggle) => (
                  <ToggleRow key={toggle.name} toggle={toggle} focusedId={focusedId} />
                ))}
              </TitleOneLine>
              <SaveFileGroup saves={model.saves} focusedId={focusedId} />
            </div>
            <TitleOneLine text={CONTROLS_GROUP_TEXT} level="span">
              {model.bindings.map((row) => (
                <BindingLine key={row.actionId} row={row} focusedId={focusedId} />
              ))}
              <RebindProblems problems={model.bindingProblems} />
              <ScreenButtonView button={model.reset} focusedId={focusedId} />
            </TitleOneLine>
          </div>
        </ScrollArea>
        <TitleOneLine text={SETTINGS_FOOTER_TEXT} level="span" layout="row">
          <ScreenButtonView button={model.close} focusedId={focusedId} />
        </TitleOneLine>
      </Panel>
    </div>
  )
}

function ToggleRow({ toggle, focusedId }: { toggle: SettingToggle; focusedId: string }) {
  return (
    <div className={styles.row}>
      <TitleOneLine
        text={toggleTextOf(toggle.name, toggle.label)}
        iconId={toggle.iconId}
        level="span"
        layout="row"
      >
        <span className={styles.controls}>
          <span data-state={toggle.valueText}>{toggle.valueText}</span>
          <ScreenButtonView button={toggle.button} focusedId={focusedId} />
        </span>
      </TitleOneLine>
    </div>
  )
}

function BindingLine({ row, focusedId }: { row: BindingRow; focusedId: string }) {
  return (
    <div className={styles.row} data-waiting={row.isWaitingForKey || undefined}>
      <TitleOneLine text={bindingTextOf(row.actionId, row.displayName)} level="span" layout="row">
        <span className={styles.controls}>
          <span className={styles.key}>{row.keyText}</span>
          <span className={styles.key}>{row.padText}</span>
          <ScreenButtonView button={row.button} focusedId={focusedId} />
        </span>
      </TitleOneLine>
    </div>
  )
}

function SaveFileGroup({ saves, focusedId }: { saves: SaveFileRow; focusedId: string }) {
  return (
    <TitleOneLine text={SAVES_GROUP_TEXT} level="span">
      <span className={styles.controls}>
        <ScreenButtonView button={saves.exportSave} focusedId={focusedId} />
        <ScreenButtonView button={saves.importSave} focusedId={focusedId} />
      </span>
      <ProblemLines
        text={SAVE_FILE_REFUSED_TEXT}
        problems={saves.problems}
        testId={UI_IDS.settingsSaveProblems}
      />
    </TitleOneLine>
  )
}

function RebindProblems({ problems }: { problems: readonly string[] }) {
  return (
    <ProblemLines
      text={REBIND_REFUSED_TEXT}
      problems={problems}
      testId={UI_IDS.settingsBindingProblems}
    />
  )
}

function ProblemLines({
  text,
  problems,
  testId,
}: {
  text: ElementText
  problems: readonly string[]
  testId: string
}) {
  if (problems.length === 0) return null
  return (
    <TitleOneLine text={text} level="span">
      <ul className={styles.problems} data-testid={testId}>
        {problems.map((problem) => (
          <li key={problem}>{problem}</li>
        ))}
      </ul>
    </TitleOneLine>
  )
}
