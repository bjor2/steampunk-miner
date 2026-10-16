/**
 * The in-run HUD: the store's HUD model, re-read as it changes, the flashes setting, the density
 * and the way up the screen is held.
 */
import { useGameStore } from '../../store/gameStore'
import { readHudModel } from '../../store/screenReads'
import { useScreenModel } from '../useScreenModel'
import { HudView } from './HudView'
import { useHudDensity } from './useHudDensity'
import { useHudOrientation } from './useHudOrientation'

export function Hud() {
  const model = useScreenModel(readHudModel)
  const isFlashing = useGameStore((state) => state.prefs.flashes)
  const density = useHudDensity()
  const orientation = useHudOrientation()
  return (
    <HudView model={model} isFlashing={isFlashing} density={density} orientation={orientation} />
  )
}
