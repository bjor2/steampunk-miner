import type { UpgradeId } from '../../../systems/economy/economyDefinition'
import { useScreenModel } from '../../../ui/useScreenModel'
import { plaqueLineOf, type PlaqueLine } from '../systems/plaqueReading'
import { useWorkshopStore } from '../store/workshopStore'
import { readPlaquePreviews } from './plaquePreviews'

export interface PlaqueLineView {
  line: PlaqueLine
  /** Changes once per "can't afford" stop on this track, so the price flashes red once. */
  priceFlashKey: number | null
}

/** The plaque's line from its latest hold's tally, else from what a hold would buy now. */
export function usePlaqueLine(upgradeId: UpgradeId): PlaqueLineView {
  const tally = useWorkshopStore((now) => now.tally)
  const previews = useScreenModel(readPlaquePreviews)
  const line = plaqueLineOf(upgradeId, tally, previews.byTrack[upgradeId], previews.reserve)
  const isShortHere = tally?.upgradeId === upgradeId && tally.cue === 'empty_clunk'
  return { line, priceFlashKey: isShortHere ? tally.endTick : null }
}
