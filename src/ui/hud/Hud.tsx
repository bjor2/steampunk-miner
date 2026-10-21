/**
 * The in-run HUD: the store's HUD model, re-read as it changes, the flashes setting, the density,
 * the way up the screen is held, the hand the controls favour, whether the strip's detail is open
 * and whether the touch gesture surface lies over the HUD (ticket 684).
 */
import { useGameStore } from '../../store/gameStore'
import { inputLayerOf } from '../../store/presentationSlice'
import { isGestureSurfaceShown } from '../../systems/input/touchControls'
import { readHudModel } from '../../store/screenReads'
import { useScreenModel } from '../useScreenModel'
import { HudView } from './HudView'
import { useHudDensity } from './useHudDensity'
import { useHudOrientation } from './useHudOrientation'

export function Hud() {
  const model = useScreenModel(readHudModel)
  const isFlashing = useGameStore((state) => state.prefs.flashes)
  const isDetailOpen = useGameStore((state) => state.isHudDetailOpen)
  const isLeftHanded = useGameStore((state) => state.prefs.leftHanded)
  const isOverTouchSurface = useGameStore((state) =>
    isGestureSurfaceShown(state.isTouchControlsShown, inputLayerOf(state)),
  )
  const density = useHudDensity()
  const orientation = useHudOrientation()
  return (
    <HudView
      model={model}
      isFlashing={isFlashing}
      density={density}
      orientation={orientation}
      isDetailOpen={isDetailOpen}
      isLeftHanded={isLeftHanded}
      isOverTouchSurface={isOverTouchSurface}
    />
  )
}
