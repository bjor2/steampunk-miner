import { describe, expect, it } from 'vitest'
import { oreTier } from '../../../systems/economy/oreEconomy'
import { toCanonical } from '../../../systems/money'
import {
  isTripClamped,
  NEW_RARITY_TRIP,
  paidRarityFind,
  rarityTripCapAt,
  type RarityFind,
  type RarityTrip,
} from './rarityTripClamp'

/** P3 band 5 with the on-curve P3 hold (#139 comment 6202970624 section 4: the case it binds in). */
const P3_BAND_5 = { planetIndex: 3, band: 5, cargoCapacity: 90 }
const EPIC = 3

function findOf(tierOffset: number): RarityFind {
  return { ...P3_BAND_5, tierOffset }
}

/** The sale tiers of `count` finds of one offset in one trip, and the trip after them. */
function tripOf(tierOffset: number, count: number): { saleTiers: number[]; trip: RarityTrip } {
  let trip = NEW_RARITY_TRIP
  const saleTiers: number[] = []
  for (let found = 0; found < count; found++) {
    const paid = paidRarityFind(trip, findOf(tierOffset))
    saleTiers.push(paid.saleTier)
    trip = paid.trip
  }
  return { saleTiers, trip }
}

describe('rarity trip clamp', () => {
  it('caps the clamped tiers at 15% of a full hold of the band ore', () => {
    // 0.15 x 90 x V(11) = 0.15 x 90 x 576.650390625, cut to the money quantum.
    expect(toCanonical(rarityTripCapAt(3, 5, 90))).toBe('7.78478e+3')
  })

  it('clamps the epic and mythic tiers only', () => {
    expect([0, 1, 2, 3, 4].map((offset) => isTripClamped(offset))).toEqual([
      false,
      false,
      false,
      true,
      true,
    ])
  })

  it('pays common, uncommon and rare finds in full and leaves the trip as it is', () => {
    for (const offset of [0, 1, 2]) {
      const { saleTiers, trip } = tripOf(offset, 40)
      expect(saleTiers.every((tier) => tier === oreTier(3, 5) + offset)).toBe(true)
      expect(trip).toBe(NEW_RARITY_TRIP)
    }
  })

  it('pays epic finds in full while the trip stays within the cap, the last landing on it', () => {
    // Four epics at floorMilli(V(14)) = 1946.195 make exactly 7784.780.
    const { saleTiers, trip } = tripOf(EPIC, 4)
    expect(saleTiers).toEqual([14, 14, 14, 14])
    expect(toCanonical(trip.clampedValue)).toBe('7.78478e+3')
  })

  it("pays a clamped find past the cap at the band's common tier and keeps the trip's value", () => {
    const { saleTiers, trip } = tripOf(EPIC, 6)
    expect(saleTiers).toEqual([14, 14, 14, 14, 11, 11])
    expect(toCanonical(trip.clampedValue)).toBe('7.78478e+3')
  })
})
