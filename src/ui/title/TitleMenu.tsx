/** The title menu (ticket 403), over the whole game while it is open; the store's model and focus. */
import { useGameStore } from '../../store/gameStore'
import { readTitleMenuModel } from '../../store/screenReads'
import { focusOnScreen } from '../../systems/views/menuFocus'
import { useScreenModel } from '../useScreenModel'
import { TitleMenuView } from './TitleMenuView'

export function TitleMenu() {
  const isOpen = useGameStore((state) => state.titleMenu !== null)
  return isOpen ? <OpenTitleMenu /> : null
}

function OpenTitleMenu() {
  const model = useScreenModel(readTitleMenuModel)
  const focusedControlId = useGameStore((state) => state.focusedControlId)
  if (model === null) return null
  const focusedId = focusOnScreen(model.focusStops, focusedControlId, model.startFocus)
  return <TitleMenuView model={model} focusedId={focusedId} />
}
