/**
 * The item heat gauge as the local player's replica holds it now, for the HUD panel and the debug
 * read: the same function on the same state, so a spec reads what the panel draws.
 */
import { readAuthorityState } from '../../../store/authorityLink'
import { useGameStore } from '../../../store/gameStore'
import type { GaugeReading } from '../../../systems/views/hudModel'
import { itemHeatReadingOf } from '../systems/itemHeatReading'

export function readItemHeatGauge(): GaugeReading | null {
  return itemHeatReadingOf(readAuthorityState(), useGameStore.getState().playerId)
}
