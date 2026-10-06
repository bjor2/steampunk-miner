/**
 * `selectSettingsModel` (#33 sections 3 and 7): the settings overlay as data. The accessibility
 * baseline (fixed camera, screen shake, flashes), the hint switch, the music switch and volume
 * (#49), TV mode and the touch controls' hand and haptics (#173), and every action with the key
 * now bound to it, "press a key to rebind" while one is waiting, the problem lines of the last
 * refused rebinding and "Reset to defaults". Local presentation only: nothing here is a command.
 */
import { settingIconIdOf } from '../art/icons/iconSet'
import { ACTION_MAP, boundLabel, type ActionId, type Bindings } from '../input/actionMap'
import type { PreferenceName, Preferences } from '../input/preferences'
import type { FocusStop } from './menuFocus'
import { uiButton, type ScreenButton } from './viewParts'
import { UI_ID_TEMPLATES, UI_IDS } from './screenIds'

export interface SettingsSources {
  prefs: Preferences
  bindings: Bindings
  /** The problems of the last refused rebinding; the defaults or the last good map rule. */
  bindingProblems: readonly string[]
  rebindingActionId: ActionId | null
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
  isWaitingForKey: boolean
  button: ScreenButton
}

export interface SettingsModel {
  toggles: SettingToggle[]
  bindings: BindingRow[]
  bindingProblems: readonly string[]
  reset: ScreenButton
  close: ScreenButton
  focusStops: FocusStop[]
}

export const SETTINGS_START_FOCUS: string = UI_IDS.settingsClose

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
  const close = uiButton(UI_IDS.settingsClose, 'Close', { kind: 'closeSettings' })
  return {
    toggles,
    bindings,
    bindingProblems: sources.bindingProblems,
    reset,
    close,
    focusStops: [
      ...toggles.map((toggle) => ({ id: toggle.button.id, panel: 'display' })),
      ...[...bindings.map((row) => row.button), reset].map((button) => ({
        id: button.id,
        panel: 'controls',
      })),
      { id: close.id, panel: 'footer' },
    ],
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
      keyText: isWaitingForKey ? 'Press a key to rebind' : boundLabel(sources.bindings, action.id),
      isWaitingForKey,
      button: uiButton(UI_ID_TEMPLATES.settingsRebind(action.id), 'Rebind', {
        kind: 'rebind',
        actionId: action.id,
      }),
    }
  })
}

function onOffText(isOn: boolean): string {
  return isOn ? 'On' : 'Off'
}
