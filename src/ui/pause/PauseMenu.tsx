/**
 * The pause menu (ticket 404), open over driving while the store holds it; the store's model and
 * focus. Its save page is the Ledger on the base sheet (ticket 688).
 */
import { useGameStore } from '../../store/gameStore'
import { readPauseMenuModel } from '../../store/screenReads'
import { focusOnScreen } from '../../systems/views/menuFocus'
import { useScreenModel } from '../useScreenModel'
import { PauseMenuView } from './PauseMenuView'

export function PauseMenu() {
  const isOpen = useGameStore((state) => state.pauseMenu !== null)
  return isOpen ? <OpenPauseMenu /> : null
}

function OpenPauseMenu() {
  const model = useScreenModel(readPauseMenuModel)
  const focusedControlId = useGameStore((state) => state.focusedControlId)
  if (model === null) return null
  const focusedId = focusOnScreen(model.focusStops, focusedControlId, model.startFocus)
  return <PauseMenuView model={model} focusedId={focusedId} />
}
