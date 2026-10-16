/**
 * `selectSettingsModel` (#33 sections 3 and 7): the settings overlay as data. The accessibility
 * baseline (fixed camera, screen shake, flashes), the hint switch, the music switch and volume
 * (#49), TV mode and the touch controls' hand and haptics (#173), and every action with the key
 * and the pad button (ticket 346) now bound to it, "press a key or pad button" while one is waiting, the problem lines of the last
 * refused rebinding and "Reset to defaults". Local presentation only: nothing here is a command.
 */
import { settingIconIdOf } from '../art/icons/iconSet'
import { ACTION_MAP, boundPadLabel, type ActionId, type Bindings } from '../input/actionMap'
import { promptLabelOf, type InputDevice } from '../input/promptLabel'
import type { PreferenceName, Preferences } from '../input/preferences'
import type { FocusStop } from './menuFocus'
import { uiButton, type ScreenButton } from './viewParts'
import { UI_ID_TEMPLATES, UI_IDS } from './screenIds'
import type { UiTextUnderTitle } from './uiText'

export interface SettingsSources {
  prefs: Preferences
  bindings: Bindings
  padBindings: Bindings
  /** On touch the key column names the touch control and the pad column is blank (P1-4 of #470). */
  inputDevice: InputDevice
  /** The problems of the last refused rebinding; the defaults or the last good map rule. */
  bindingProblems: readonly string[]
  rebindingActionId: ActionId | null
  /** Why the last save export or import was refused (ticket 479); [] after one that worked. */
  saveTransferProblems: readonly string[]
}

export interface SettingToggle {
  name: PreferenceName
  iconId: string
  label: string
  valueText: string
  button: ScreenButton
}

export interface BindingRow {
  actionId: ActionId
  displayName: string
  keyText: string
  /** The pad chord bound, blank while the action waits (the key text says what to press). */
  padText: string
  isWaitingForKey: boolean
  button: ScreenButton
}

/** The save file's buttons and the refusal of the last export or import (ticket 479). */
export interface SaveFileRow {
  exportSave: ScreenButton
  importSave: ScreenButton
  problems: readonly string[]
}

export interface SettingsModel {
  toggles: SettingToggle[]
  bindings: BindingRow[]
  bindingProblems: readonly string[]
  reset: ScreenButton
  saves: SaveFileRow
  close: ScreenButton
  focusStops: FocusStop[]
}

export const SETTINGS_START_FOCUS: string = UI_IDS.settingsClose

/**
 * The panel header under the #422 text budget (build #423, the kit's example element): one line
 * on what the panel holds, and a tooltip on what Rebind and Reset do. Nothing a player needs to
 * act is only here: the rows say it themselves.
 */
export const SETTINGS_HEADING: UiTextUnderTitle = {
  id: UI_IDS.settingsPanel,
  oneLine: 'Display switches and the keys and pad buttons of every action.',
  tooltipLines: [
    'Rebind waits for your next key or pad button.',
    'Reset puts every binding back to its default.',
  ],
}

const TOGGLE_LABELS: Readonly<Record<PreferenceName, string>> = {
  cameraMode: 'Camera',
  shake: 'Screen shake',
  flashes: 'Flashes',
  hintsEnabled: 'Show hints',
  tvMode: 'TV mode',
  leftHanded: 'Touch controls',
  musicMuted: 'Music',
  musicVolume: 'Music volume',
  haptics: 'Haptics',
}

const CAMERA_MODE_TEXT = { rotating: 'Rotating with planet', fixed: 'Fixed, north up' } as const

const PERCENT = 100

const WAITING_TEXT = 'Press a key or pad button to rebind'

const VALUE_TEXTS: Readonly<Record<PreferenceName, (prefs: Preferences) => string>> = {
  cameraMode: (prefs) => CAMERA_MODE_TEXT[prefs.cameraMode],
  shake: (prefs) => onOffText(prefs.shake),
  flashes: (prefs) => onOffText(prefs.flashes),
  hintsEnabled: (prefs) => onOffText(prefs.hintsEnabled),
  musicMuted: (prefs) => onOffText(!prefs.musicMuted),
  musicVolume: (prefs) => `${Math.round(prefs.musicVolume * PERCENT)}%`,
  tvMode: (prefs) => onOffText(prefs.tvMode),
  leftHanded: (prefs) => (prefs.leftHanded ? 'Left-handed' : 'Right-handed'),
  haptics: (prefs) => onOffText(prefs.haptics),
}

export function selectSettingsModel(sources: SettingsSources): SettingsModel {
  const toggles = togglesOf(sources.prefs)
  const bindings = bindingRowsOf(sources)
  const reset = uiButton(UI_IDS.settingsResetBindings, 'Reset to defaults', {
    kind: 'resetBindings',
  })
  const saves = saveFileRowOf(sources.saveTransferProblems)
  const close = uiButton(UI_IDS.settingsClose, 'Close', { kind: 'closeSettings' })
  return {
    toggles,
    bindings,
    bindingProblems: sources.bindingProblems,
    reset,
    saves,
    close,
    focusStops: [
      ...toggles.map((toggle) => ({ id: toggle.button.id, panel: 'display' })),
      ...[...bindings.map((row) => row.button), reset].map((button) => ({
        id: button.id,
        panel: 'controls',
      })),
      ...[saves.exportSave, saves.importSave].map((button) => ({ id: button.id, panel: 'saves' })),
      { id: close.id, panel: 'footer' },
    ],
  }
}

/** Always pressable: a refusal (nothing saved yet, a file this build cannot read) says why. */
function saveFileRowOf(problems: readonly string[]): SaveFileRow {
  return {
    exportSave: uiButton(UI_IDS.settingsExportSave, 'Export save', { kind: 'exportSave' }),
    importSave: uiButton(UI_IDS.settingsImportSave, 'Import save', { kind: 'importSave' }),
    problems,
  }
}

function togglesOf(prefs: Preferences): SettingToggle[] {
  return (Object.keys(TOGGLE_LABELS) as PreferenceName[]).map((name) => ({
    name,
    iconId: settingIconIdOf(name),
    label: TOGGLE_LABELS[name],
    valueText: VALUE_TEXTS[name](prefs),
    button: uiButton(UI_ID_TEMPLATES.settingsToggle(name), 'Change', {
      kind: 'togglePreference',
      name,
    }),
  }))
}

function bindingRowsOf(sources: SettingsSources): BindingRow[] {
  return ACTION_MAP.actions.map((action) => {
    const isWaitingForKey = sources.rebindingActionId === action.id
    return {
      actionId: action.id,
      displayName: action.displayName,
      keyText: isWaitingForKey ? WAITING_TEXT : keyColumnTextOf(sources, action.id),
      padText: isWaitingForKey ? '' : padColumnTextOf(sources, action.id),
      isWaitingForKey,
      button: uiButton(UI_ID_TEMPLATES.settingsRebind(action.id), 'Rebind', {
        kind: 'rebind',
        actionId: action.id,
      }),
    }
  })
}

function keyColumnTextOf(sources: SettingsSources, actionId: ActionId): string {
  const device = sources.inputDevice === 'touch' ? 'touch' : 'keyboard'
  return promptLabelOf(actionId, sources, device)
}

function padColumnTextOf(sources: SettingsSources, actionId: ActionId): string {
  return sources.inputDevice === 'touch' ? '' : boundPadLabel(sources.padBindings, actionId)
}

function onOffText(isOn: boolean): string {
  return isOn ? 'On' : 'Off'
}
