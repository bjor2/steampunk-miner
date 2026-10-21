/**
 * The on-screen driving controls (#173): shown on a finger's touch and hidden by a key. While the
 * vehicle has the input, a pinch-and-double-tap surface, the floating stick and the pause button
 * (ticket 472); in any layer, the cluster of the buttons the situation allows, then the slices'
 * touch binding tiles (#474). The tools are the HUD's tool slot bar (ticket 691). Markup only; every gesture
 * goes to the touch runtime, which presses the actions the keys would.
 */
import { useGameStore } from '../../store/gameStore'
import { readTouchSituation } from '../../store/screenReads'
import {
  clusterActionsOf,
  isPauseButtonShown,
  isStickShown,
  type TouchSituation,
} from '../../systems/input/touchControls'
import { DEVICE_UI_IDS } from '../stage/deviceIds'
import { useScreenModel } from '../useScreenModel'
import { GestureSurface } from './GestureSurface'
import { StickZone } from './StickZone'
import { TouchBindingTiles } from './TouchBindingTiles'
import { TouchCluster } from './TouchCluster'
import { TouchPauseButton } from './TouchPauseButton'
import styles from './TouchControls.module.css'

export function TouchControls() {
  const isShown = useGameStore((state) => state.isTouchControlsShown)
  const isLeftHanded = useGameStore((state) => state.prefs.leftHanded)
  const situation = useScreenModel(readTouchSituation)
  if (!isShown) return null
  return <TouchControlsView situation={situation} isLeftHanded={isLeftHanded} />
}

/** The shown controls for one situation; a server render draws them from props alone. */
export function TouchControlsView({
  situation,
  isLeftHanded,
}: {
  situation: TouchSituation
  isLeftHanded: boolean
}) {
  const isDriving = isStickShown(situation.layer)
  return (
    <div
      className={styles.controls}
      data-testid={DEVICE_UI_IDS.touchControls}
      data-hand={isLeftHanded ? 'left' : 'right'}
    >
      {isDriving && <GestureSurface />}
      {isDriving && <StickZone />}
      {isPauseButtonShown(situation.layer) && <TouchPauseButton />}
      <TouchCluster actions={clusterActionsOf(situation)} />
      <TouchBindingTiles />
    </div>
  )
}
