/**
 * The bay screen, open while docked (#8, #33), for the bay the vehicle is docked at (#37): the
 * store's model and menu focus, behind the brass shutter that slides it in and out (#45). While
 * the shutter closes, the bay it showed stays drawn and takes no input.
 */
import type { CSSProperties, ReactNode } from 'react'
import { useGameStore } from '../../store/gameStore'
import { readDockedBay, readSellBayModel, readUpgradeBayModel } from '../../store/screenReads'
import { focusOnScreen } from '../../systems/views/menuFocus'
import { SELL_BAY_START_FOCUS } from '../../systems/views/sellBayModel'
import { upgradeBayStartFocus } from '../../systems/views/upgradeBayModel'
import { useScreenModel } from '../useScreenModel'
import styles from './BayShutter.module.css'
import { SellBayView } from './SellBayView'
import { UpgradeBayView } from './UpgradeBayView'
import { useBayShutter, type BayShutter } from './useBayShutter'

export function PlatformScreen() {
  const shutter = useBayShutter(useScreenModel(readDockedBay))
  if (shutter.bay === null) return null
  return (
    <ShutterFrame shutter={shutter}>
      {shutter.bay === 'sell' ? <SellBayScreen /> : <UpgradeBayScreen />}
    </ShutterFrame>
  )
}

function ShutterFrame({ shutter, children }: { shutter: BayShutter; children: ReactNode }) {
  const duration = { '--bay-transition-seconds': `${shutter.transition.seconds}s` }
  return (
    <div
      className={styles.shutter}
      style={duration as CSSProperties}
      data-transition={shutter.phase}
      data-transition-kind={shutter.transition.kind}
      aria-hidden={shutter.phase === 'closing' || undefined}
    >
      {children}
    </div>
  )
}

function SellBayScreen() {
  const model = useScreenModel(readSellBayModel)
  const focusedControlId = useGameStore((state) => state.focusedControlId)
  const focusedId = focusOnScreen(model.focusStops, focusedControlId, SELL_BAY_START_FOCUS)
  return <SellBayView model={model} focusedId={focusedId} />
}

function UpgradeBayScreen() {
  const model = useScreenModel(readUpgradeBayModel)
  const focusedControlId = useGameStore((state) => state.focusedControlId)
  const start = upgradeBayStartFocus(model)
  const focusedId = focusOnScreen(model.focusStops, focusedControlId, start)
  return <UpgradeBayView model={model} focusedId={focusedId} />
}
