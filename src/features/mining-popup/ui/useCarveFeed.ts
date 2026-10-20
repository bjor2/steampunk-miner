import { useEffect } from 'react'
import { listenForCarvedCells } from '../../../store/carveCompleteBroadcast'
import type { CarvedCell } from '../../../systems/materialPop/carveWatch'

/**
 * Hands every batch of cells the drill finished carving (ticket 615) to the popup store while the
 * chips are drawn, as `usePopupFeed` hands the authority's events.
 */
export function useCarveFeed(observe: (cells: readonly CarvedCell[], playerId: string) => void) {
  useEffect(() => listenForCarvedCells(observe), [observe])
}
