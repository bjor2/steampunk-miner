/** The platform screen, open exactly while docked (#8, #33): the store's model and menu focus. */
import { useGameStore } from '../../store/gameStore'
import { readPlatformModel } from '../../store/screenReads'
import { focusOnScreen } from '../../systems/views/menuFocus'
import { PLATFORM_START_FOCUS } from '../../systems/views/platformModel'
import { useScreenModel } from '../useScreenModel'
import { PlatformView } from './PlatformView'

export function PlatformScreen() {
  const isDocked = useGameStore((state) => state.vehicle.mode === 'docked')
  return isDocked ? <OpenPlatformScreen /> : null
}

function OpenPlatformScreen() {
  const model = useScreenModel(readPlatformModel)
  const focusedControlId = useGameStore((state) => state.focusedControlId)
  const focusedId = focusOnScreen(model.focusStops, focusedControlId, PLATFORM_START_FOCUS)
  return <PlatformView model={model} focusedId={focusedId} />
}
