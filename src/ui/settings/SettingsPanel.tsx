/** The settings overlay (#33 sections 3 and 7), open over any layer; the store's model and focus. */
import { useGameStore } from '../../store/gameStore'
import { readSettingsModel } from '../../store/screenReads'
import { focusOnScreen } from '../../systems/views/menuFocus'
import { SETTINGS_START_FOCUS } from '../../systems/views/settingsModel'
import { useScreenModel } from '../useScreenModel'
import { SettingsView } from './SettingsView'

export function SettingsPanel() {
  const isOpen = useGameStore((state) => state.isSettingsOpen)
  return isOpen ? <OpenSettingsPanel /> : null
}

function OpenSettingsPanel() {
  const model = useScreenModel(readSettingsModel)
  const focusedControlId = useGameStore((state) => state.focusedControlId)
  const focusedId = focusOnScreen(model.focusStops, focusedControlId, SETTINGS_START_FOCUS)
  return <SettingsView model={model} focusedId={focusedId} />
}
