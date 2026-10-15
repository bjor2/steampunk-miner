/**
 * The settings overlay's text on the shared Title+OneLine element (spec #422, pass #429): the
 * display switches and the controls each under a group title, a switch or an action as one row
 * titled by its name, a refused rebinding as a title over its problem lines, and Close under its
 * own title. The panel header (`SETTINGS_HEADING`) says what Rebind and Reset do.
 */
import type { ActionId } from '../../systems/input/actionMap'
import type { PreferenceName } from '../../systems/input/preferences'
import type { ElementText } from '../../systems/views/uiText'

export const DISPLAY_GROUP_TEXT: ElementText = {
  id: 'settings.display',
  title: 'Display',
  oneLine: '',
  tooltipLines: [],
}

export const CONTROLS_GROUP_TEXT: ElementText = {
  id: 'settings.controls',
  title: 'Controls',
  oneLine: '',
  tooltipLines: [],
}

export const REBIND_REFUSED_TEXT: ElementText = {
  id: 'settings.rebind-refused',
  title: 'Rebind refused',
  oneLine: '',
  tooltipLines: [],
}

export const SETTINGS_FOOTER_TEXT: ElementText = {
  id: 'settings.footer',
  title: 'Back to the game',
  oneLine: '',
  tooltipLines: [],
}

export function toggleTextOf(name: PreferenceName, label: string): ElementText {
  return { id: `settings.toggle.${name}`, title: label, oneLine: '', tooltipLines: [] }
}

export function bindingTextOf(actionId: ActionId, displayName: string): ElementText {
  return { id: `settings.binding.${actionId}`, title: displayName, oneLine: '', tooltipLines: [] }
}
