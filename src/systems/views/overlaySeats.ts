/**
 * Who may draw on the HUD overlay (#208): at most `OVERLAY_CARD_CAP` cards hold a seat. A card
 * past the cap takes a seat anyway and the lowest priority leaves, the oldest first among equals,
 * which may be the newcomer itself; each departure counts one eviction for the debug API.
 * An evicted card stays out until it is shown again (a new claim).
 */
import { OVERLAY_CARD_CAP } from '../../constants/screen'

export interface OverlaySeat {
  /** Claim order: a smaller id is older. */
  id: number
  priority: number
}

export interface OverlaySeats {
  seated: OverlaySeat[]
  nextSeatId: number
  evictions: number
}

export function createOverlaySeats(): OverlaySeats {
  return { seated: [], nextSeatId: 1, evictions: 0 }
}

/** Seats a card of `priority` and returns its seat id, evicting one card when over the cap. */
export function claimOverlaySeat(seats: OverlaySeats, priority: number): number {
  const id = seats.nextSeatId
  seats.nextSeatId = id + 1
  seats.seated.push({ id, priority })
  if (seats.seated.length > OVERLAY_CARD_CAP) evictOneSeat(seats)
  return id
}

export function releaseOverlaySeat(seats: OverlaySeats, seatId: number): void {
  seats.seated = seats.seated.filter((seat) => seat.id !== seatId)
}

export function isOverlaySeatHeld(seats: OverlaySeats, seatId: number): boolean {
  return seats.seated.some((seat) => seat.id === seatId)
}

function evictOneSeat(seats: OverlaySeats): void {
  const leaving = seats.seated.reduce(firstToLeave)
  releaseOverlaySeat(seats, leaving.id)
  seats.evictions += 1
}

/** The lower priority leaves; among equal priorities, the older seat. */
function firstToLeave(a: OverlaySeat, b: OverlaySeat): OverlaySeat {
  if (a.priority !== b.priority) return a.priority < b.priority ? a : b
  return a.id < b.id ? a : b
}
