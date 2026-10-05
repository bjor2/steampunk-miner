/** The in-run HUD: the store's HUD model, re-read as it changes, and the flashes setting. */
import { useGameStore } from '../../store/gameStore'
import { readHudModel } from '../../store/screenReads'
import { useScreenModel } from '../useScreenModel'
import { HudView } from './HudView'

export function Hud() {
  const model = useScreenModel(readHudModel)
  const isFlashing = useGameStore((state) => state.prefs.flashes)
  return <HudView model={model} isFlashing={isFlashing} />
}
