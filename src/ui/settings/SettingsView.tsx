/**
 * Settings drawn from their view model: the display switches, every action with its key, its pad
 * button and a rebind button, the problem lines of a refused rebinding, reset, and close. Each
 * group, row and the footer is one shared Title+OneLine element (spec #422, pass #429), the rows
 * scrolling in the shared scroll area. Markup only.
 */
import {
  SETTINGS_HEADING,
  type BindingRow,
  type SettingToggle,
  type SettingsModel,
} from '../../systems/views/settingsModel'
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
  SETTINGS_FOOTER_TEXT,
  toggleTextOf,
} from './settingsElements'

export function SettingsView({ model, focusedId }: { model: SettingsModel; focusedId: string }) {
  return (
    <div className={styles.overlay} data-testid={UI_IDS.settingsPanel}>
      <Panel title="Settings" iconId={panelIconIdOf('settings')} heading={SETTINGS_HEADING}>
        <ScrollArea className={styles.scroll}>
          <div className={styles.columns}>
            <TitleOneLine text={DISPLAY_GROUP_TEXT} level="span">
              {model.toggles.map((toggle) => (
                <ToggleRow key={toggle.name} toggle={toggle} focusedId={focusedId} />
              ))}
            </TitleOneLine>
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

function RebindProblems({ problems }: { problems: readonly string[] }) {
  if (problems.length === 0) return null
  return (
    <TitleOneLine text={REBIND_REFUSED_TEXT} level="span">
      <ul className={styles.problems} data-testid={UI_IDS.settingsBindingProblems}>
        {problems.map((problem) => (
          <li key={problem}>{problem}</li>
        ))}
      </ul>
    </TitleOneLine>
  )
}
