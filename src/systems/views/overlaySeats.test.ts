import { describe, expect, it } from 'vitest'
import { OVERLAY_CARD_CAP } from '../../constants/screen'
import {
  claimOverlaySeat,
  createOverlaySeats,
  isOverlaySeatHeld,
  releaseOverlaySeat,
  type OverlaySeats,
} from './overlaySeats'

function seatsWithClaims(priorities: readonly number[]): { seats: OverlaySeats; ids: number[] } {
  const seats = createOverlaySeats()
  const ids = priorities.map((priority) => claimOverlaySeat(seats, priority))
  return { seats, ids }
}

const heldIds = (seats: OverlaySeats) => seats.seated.map((seat) => seat.id)

describe('overlay seats', () => {
  it('seats sixteen cards with no eviction', () => {
    const { seats, ids } = seatsWithClaims(Array.from({ length: OVERLAY_CARD_CAP }, () => 5))
    expect(heldIds(seats)).toEqual(ids)
    expect(seats.evictions).toBe(0)
  })

  it('evicts the lowest-priority card when a seventeenth arrives, and counts it', () => {
    const priorities = Array.from({ length: OVERLAY_CARD_CAP }, (_, index) => (index === 7 ? 1 : 5))
    const { seats, ids } = seatsWithClaims(priorities)
    const newcomer = claimOverlaySeat(seats, 5)
    expect(isOverlaySeatHeld(seats, ids[7])).toBe(false)
    expect(isOverlaySeatHeld(seats, newcomer)).toBe(true)
    expect(seats.seated).toHaveLength(OVERLAY_CARD_CAP)
    expect(seats.evictions).toBe(1)
  })

  it('evicts the oldest card among the lowest priority', () => {
    const { seats, ids } = seatsWithClaims([9, 2, 9, 2, ...Array.from({ length: 12 }, () => 9)])
    claimOverlaySeat(seats, 9)
    expect(isOverlaySeatHeld(seats, ids[1])).toBe(false)
    expect(isOverlaySeatHeld(seats, ids[3])).toBe(true)
  })

  it('turns away a newcomer whose priority is lower than every seated card', () => {
    const { seats, ids } = seatsWithClaims(Array.from({ length: OVERLAY_CARD_CAP }, () => 5))
    const newcomer = claimOverlaySeat(seats, 0)
    expect(isOverlaySeatHeld(seats, newcomer)).toBe(false)
    expect(heldIds(seats)).toEqual(ids)
    expect(seats.evictions).toBe(1)
  })

  it('frees a seat when a card leaves, so the next card evicts nobody', () => {
    const { seats, ids } = seatsWithClaims(Array.from({ length: OVERLAY_CARD_CAP }, () => 5))
    releaseOverlaySeat(seats, ids[0])
    claimOverlaySeat(seats, 5)
    expect(seats.evictions).toBe(0)
  })
})
