import { afterEach, describe, expect, it } from 'vitest'
import { OVERLAY_CARD_CAP } from '../constants/screen'
import { leaveOverlaySeat, takeOverlaySeat } from '../ui/overlay/overlaySeatTable'
import { createDebugApi } from './debugApi'

// #208 acceptance 5: the overlay's cards take seats as they show (what `OverlayCard` does on
// mount); past the cap the lowest priority leaves and the debug counter says so.

let taken: number[] = []

afterEach(() => {
  taken.forEach(leaveOverlaySeat)
  taken = []
})

function showCards(priorities: readonly number[]): void {
  taken.push(...priorities.map(takeOverlaySeat))
}

const overlayStats = () => {
  const result = createDebugApi().ui.getOverlayStats()
  if (!result.ok) throw new Error(result.problems.join('; '))
  return result.stats
}

describe('debug api: the HUD overlay (#208)', () => {
  it('counts the seated cards with no eviction up to the cap', () => {
    const before = overlayStats()
    showCards(Array.from({ length: OVERLAY_CARD_CAP }, () => 3))
    expect(overlayStats()).toEqual({ seated: OVERLAY_CARD_CAP, evictions: before.evictions })
  })

  it('counts one eviction when a seventeenth card shows, keeping sixteen seated', () => {
    const before = overlayStats()
    showCards([1, ...Array.from({ length: OVERLAY_CARD_CAP }, () => 3)])
    expect(overlayStats()).toEqual({ seated: OVERLAY_CARD_CAP, evictions: before.evictions + 1 })
  })
})
