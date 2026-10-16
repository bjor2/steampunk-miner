/**
 * The hint and transmission plaques: the store's plaque model, re-read as it changes. On the
 * compact HUD (#500) the hint chip's place and room are measured here and its dismiss is the
 * store's.
 */
import { useGameStore } from '../../store/gameStore'
import { readPlaqueModel } from '../../store/screenReads'
import { useHudDensity } from '../hud/useHudDensity'
import { useScreenModel } from '../useScreenModel'
import { PlaquesView } from './PlaquesView'
import { useHintRoom } from './useHintRoom'

export function Plaques() {
  const model = useScreenModel(readPlaqueModel)
  const isCompact = useHudDensity() === 'compact'
  const chipPlace = useHintRoom(isCompact)
  const dismissHint = useGameStore((state) => state.dismissHint)
  return (
    <PlaquesView
      model={model}
      chipPlace={chipPlace}
      onDismissHint={dismissHint}
      isCompact={isCompact}
    />
  )
}
