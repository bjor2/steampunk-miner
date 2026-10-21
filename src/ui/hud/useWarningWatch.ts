/**
 * The warning layer's feed (ticket 685): each time the HUD re-reads its model, the store's watch
 * looks at the same readings the strip draws, so a warning fires only while the HUD is up and
 * from exactly what it shows.
 */
import { useEffect } from 'react'
import { useGameStore } from '../../store/gameStore'
import type { HudModel } from '../../systems/views/hudModel'
import { hudWarningReadingsOf } from '../../systems/views/warningWatch'

export function useWarningWatch(model: HudModel): void {
  useEffect(() => followHudWarnings(model), [model])
}

export function followHudWarnings(model: HudModel): void {
  useGameStore.getState().followWarnings(hudWarningReadingsOf(model))
}
