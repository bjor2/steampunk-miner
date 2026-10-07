import { useCallback, useLayoutEffect, useState, useSyncExternalStore } from 'react'
import {
  holdsOverlaySeat,
  leaveOverlaySeat,
  subscribeToOverlaySeats,
  takeOverlaySeat,
} from './overlaySeatTable'

/**
 * Takes an overlay seat while the card is mounted (#208) and says whether it still holds one: a
 * card past the cap with the lowest priority is evicted and draws nothing until shown again.
 * Server rendering never seats a card, so the overlay adds no markup there.
 */
export function useOverlaySeat(priority: number): boolean {
  const [seatId, setSeatId] = useState<number | null>(null)
  useLayoutEffect(() => {
    const taken = takeOverlaySeat(priority)
    setSeatId(taken)
    return () => leaveOverlaySeat(taken)
  }, [priority])
  const isSeated = useCallback(() => seatId !== null && holdsOverlaySeat(seatId), [seatId])
  return useSyncExternalStore(subscribeToOverlaySeats, isSeated, isNeverSeated)
}

function isNeverSeated(): boolean {
  return false
}
