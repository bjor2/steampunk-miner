/** The in-run HUD: the store's HUD model, re-read as it changes, the flashes setting and density. */
import { useGameStore } from '../../store/gameStore'
import { readHudModel } from '../../store/screenReads'
import { useScreenModel } from '../useScreenModel'
import { HudView } from './HudView'
import { useHudDensity } from './useHudDensity'

export function Hud() {
  const model = useScreenModel(readHudModel)
  const isFlashing = useGameStore((state) => state.prefs.flashes)
  const density = useHudDensity()
  return <HudView model={model} isFlashing={isFlashing} density={density} />
}
