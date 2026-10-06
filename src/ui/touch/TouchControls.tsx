/**
 * The on-screen driving controls (#173): shown on a finger's touch and hidden by a key. While the
 * vehicle has the input, a pinch-and-double-tap surface and the floating stick; in any layer, the
 * cluster of the buttons the situation allows. Markup only; every gesture goes to the touch
 * runtime, which presses the actions the keys would.
 */
import { useGameStore } from '../../store/gameStore'
import { readTouchSituation } from '../../store/screenReads'
import { clusterActionsOf, isStickShown } from '../../systems/input/touchControls'
import { DEVICE_UI_IDS } from '../stage/deviceIds'
import { useScreenModel } from '../useScreenModel'
import { GestureSurface } from './GestureSurface'
import { StickZone } from './StickZone'
import { TouchCluster } from './TouchCluster'
import styles from './TouchControls.module.css'

export function TouchControls() {
  const isShown = useGameStore((state) => state.isTouchControlsShown)
  const isLeftHanded = useGameStore((state) => state.prefs.leftHanded)
  const situation = useScreenModel(readTouchSituation)
  if (!isShown) return null
  const isDriving = isStickShown(situation.layer)
  const actions = clusterActionsOf(situation)
  return (
    <div
      className={styles.controls}
      data-testid={DEVICE_UI_IDS.touchControls}
      data-hand={isLeftHanded ? 'left' : 'right'}
    >
      {isDriving && <GestureSurface />}
      {isDriving && <StickZone />}
      <TouchCluster actions={actions} />
    </div>
  )
}
