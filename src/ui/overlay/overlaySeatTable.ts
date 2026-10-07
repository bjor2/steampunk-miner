/**
 * The overlay's one seat table (#208), written only by `OverlayCard` as cards show and hide and
 * read by the cards and the debug API. Module state rather than the store: it is layout
 * bookkeeping of the DOM over the canvas, never game state, and changes only when a card mounts
 * or leaves, never per frame.
 */
import {
  claimOverlaySeat,
  createOverlaySeats,
  isOverlaySeatHeld,
  releaseOverlaySeat,
} from '../../systems/views/overlaySeats'

export interface OverlayStats {
  seated: number
  evictions: number
}

const seats = createOverlaySeats()
const seatListeners = new Set<() => void>()

export function takeOverlaySeat(priority: number): number {
  const seatId = claimOverlaySeat(seats, priority)
  seatListeners.forEach(callSeatListener)
  return seatId
}

export function leaveOverlaySeat(seatId: number): void {
  releaseOverlaySeat(seats, seatId)
  seatListeners.forEach(callSeatListener)
}

export function holdsOverlaySeat(seatId: number): boolean {
  return isOverlaySeatHeld(seats, seatId)
}

/** Calls `listener` whenever a card takes or leaves a seat; returns the unsubscribe. */
export function subscribeToOverlaySeats(listener: () => void): () => void {
  seatListeners.add(listener)
  return () => seatListeners.delete(listener)
}

export function readOverlayStats(): OverlayStats {
  return { seated: seats.seated.length, evictions: seats.evictions }
}

function callSeatListener(listener: () => void): void {
  listener()
}
