/**
 * Settings drawn from their view model: the display switches, every action with its key and a
 * rebind button, the problem lines of a refused rebinding, reset, and close. Markup only.
 */
import type { BindingRow, SettingToggle, SettingsModel } from '../../systems/views/settingsModel'
import { panelIconIdOf } from '../../systems/art/icons/iconSet'
import { Panel } from '../kit/Panel'
import { UI_IDS } from '../ids'
import { ScreenButtonView } from '../ScreenButtonView'
import { VectorIcon } from '../VectorIcon'
import styles from './Settings.module.css'

export function SettingsView({ model, focusedId }: { model: SettingsModel; focusedId: string }) {
  return (
    <div className={styles.overlay} data-testid={UI_IDS.settingsPanel}>
      <Panel title="Settings" iconId={panelIconIdOf('settings')}>
        <div className={styles.columns}>
          <section>
            {model.toggles.map((toggle) => (
              <ToggleRow key={toggle.name} toggle={toggle} focusedId={focusedId} />
            ))}
          </section>
          <section>
            {model.bindings.map((row) => (
              <BindingLine key={row.actionId} row={row} focusedId={focusedId} />
            ))}
            {model.bindingProblems.length > 0 && (
              <ul className={styles.problems} data-testid={UI_IDS.settingsBindingProblems}>
                {model.bindingProblems.map((problem) => (
                  <li key={problem}>{problem}</li>
                ))}
              </ul>
            )}
            <ScreenButtonView button={model.reset} focusedId={focusedId} />
          </section>
        </div>
        <ScreenButtonView button={model.close} focusedId={focusedId} />
      </Panel>
    </div>
  )
}

function ToggleRow({ toggle, focusedId }: { toggle: SettingToggle; focusedId: string }) {
  return (
    <div className={styles.row}>
      <span className={styles.setting}>
        <VectorIcon iconId={toggle.iconId} size="menu" />
        {toggle.label}
      </span>
      <span data-state={toggle.valueText}>{toggle.valueText}</span>
      <ScreenButtonView button={toggle.button} focusedId={focusedId} />
    </div>
  )
}

function BindingLine({ row, focusedId }: { row: BindingRow; focusedId: string }) {
  return (
    <div className={styles.row} data-waiting={row.isWaitingForKey || undefined}>
      <span>{row.displayName}</span>
      <span className={styles.key}>{row.keyText}</span>
      <ScreenButtonView button={row.button} focusedId={focusedId} />
    </div>
  )
}
