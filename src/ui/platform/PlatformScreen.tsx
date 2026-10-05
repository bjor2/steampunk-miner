/**
 * The bay screen, open exactly while docked (#8, #33), for the bay the vehicle is docked at
 * (#37): the store's model and menu focus.
 */
import { useGameStore } from '../../store/gameStore'
import { readBayScreen } from '../../store/screenReads'
import { focusOnScreen } from '../../systems/views/menuFocus'
import { SELL_BAY_START_FOCUS } from '../../systems/views/sellBayModel'
import { upgradeBayStartFocus } from '../../systems/views/upgradeBayModel'
import { useScreenModel } from '../useScreenModel'
import { SellBayView } from './SellBayView'
import { UpgradeBayView } from './UpgradeBayView'

export function PlatformScreen() {
  const isDocked = useGameStore((state) => state.vehicle.mode === 'docked')
  return isDocked ? <OpenBayScreen /> : null
}

function OpenBayScreen() {
  const screen = useScreenModel(readBayScreen)
  const focusedControlId = useGameStore((state) => state.focusedControlId)
  if (screen === null) return null
  if (screen.bay === 'sell') {
    const focusedId = focusOnScreen(screen.model.focusStops, focusedControlId, SELL_BAY_START_FOCUS)
    return <SellBayView model={screen.model} focusedId={focusedId} />
  }
  const start = upgradeBayStartFocus(screen.model)
  const focusedId = focusOnScreen(screen.model.focusStops, focusedControlId, start)
  return <UpgradeBayView model={screen.model} focusedId={focusedId} />
}
