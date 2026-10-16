import { describe, expect, it } from 'vitest'
import { oreTier } from '../../../systems/economy/oreEconomy'
import { createSeededRandom, type SeededRandom } from '../../../systems/seededRandom'
import { rarityWeightBpOf } from './rarityTiers'
import { isTripClamped, NEW_RARITY_TRIP, paidRarityFind } from './rarityTripClamp'

// The Vertical Scaler's trip bounds under the clamp (ticket 509; TD ruling 6221725921 on #445,
// sections 4 and 6; Systems' model on #139, comment 6202970624 section 4). Seeded trips fill a hold
// in one band on the mixed rows, each epic and mythic find priced by the clamp: their share of a
// trip never passes 1500 bp, and the clamp costs about a basis point of mean income where it binds
// (P3 band 5: TD 0.98 bp, Systems 0.87 bp) and nothing from P10. The signature is left out: it is
// never clamped and only lowers the epic and mythic share.

const LEADS = [0, 1, 2, 3, 4]
const TRIPS = 20000
const SEED = 20261015
/** Systems' on-curve linear hold: 10 + 4 a level at level 6p + 2 (P3 90, P10 258). */
const holdOn = (planetIndex: number) => 10 + 4 * (6 * planetIndex + 2)
const EPIC_AND_MYTHIC_MAX_BP = 1500

interface TripRow {
  planetIndex: number
  band: number
}

interface TripTotals {
  worstEpicAndMythicBp: number
  unclampedValue: number
  paidValue: number
}

/** Basis points of band `band`'s ore at each lead on the mixed rows; common takes the rest. */
function leadWeightsBpOf(band: number): number[] {
  const rated = LEADS.slice(1).map((lead) => rarityWeightBpOf('mixed', lead, band))
  return [10000 - rated.reduce((sum, weight) => sum + weight, 0), ...rated]
}

function drawLead(random: SeededRandom, weightsBp: readonly number[]): number {
  let roll = random.nextInt(10000)
  for (const lead of LEADS) {
    if (roll < weightsBp[lead]) return lead
    roll -= weightsBp[lead]
  }
  return 0
}

/** One hold of finds in one band: values in units of the band ore, `V(t_b + k) / V(t_b)`. */
function playTrip(random: SeededRandom, row: TripRow, weightsBp: readonly number[]) {
  const bandTier = oreTier(row.planetIndex, row.band)
  let trip = NEW_RARITY_TRIP
  const totals = { unclamped: 0, paid: 0, epicAndMythic: 0 }
  for (let unit = 0; unit < holdOn(row.planetIndex); unit++) {
    const lead = drawLead(random, weightsBp)
    const find = { ...row, tierAboveBand: lead, saleTier: bandTier + lead }
    const paid = paidRarityFind(trip, { ...find, cargoCapacity: holdOn(row.planetIndex) })
    const paidValue = 1.5 ** (paid.saleTier - bandTier)
    totals.unclamped += 1.5 ** lead
    totals.paid += paidValue
    if (isTripClamped(lead) && paid.saleTier !== bandTier) totals.epicAndMythic += paidValue
    trip = paid.trip
  }
  return totals
}

function playTrips(row: TripRow): TripTotals {
  const random = createSeededRandom(SEED)
  const weightsBp = leadWeightsBpOf(row.band)
  const totals: TripTotals = { worstEpicAndMythicBp: 0, unclampedValue: 0, paidValue: 0 }
  for (let at = 0; at < TRIPS; at++) {
    const trip = playTrip(random, row, weightsBp)
    const shareBp = (trip.epicAndMythic / trip.paid) * 10000
    totals.worstEpicAndMythicBp = Math.max(totals.worstEpicAndMythicBp, shareBp)
    totals.unclampedValue += trip.unclamped
    totals.paidValue += trip.paid
  }
  return totals
}

const meanCostBpOf = (totals: TripTotals) =>
  ((totals.unclampedValue - totals.paidValue) / totals.unclampedValue) * 10000

const P3_BAND_5 = playTrips({ planetIndex: 3, band: 5 })
const P10_BAND_5 = playTrips({ planetIndex: 10, band: 5 })

describe('rarity trip shares under the clamp', () => {
  it('keeps epic and mythic within 1500 bp of every seeded trip, P3 to P10', () => {
    const rows = [P3_BAND_5, playTrips({ planetIndex: 3, band: 4 }), P10_BAND_5]
    for (const totals of rows)
      expect(totals.worstEpicAndMythicBp).toBeLessThanOrEqual(EPIC_AND_MYTHIC_MAX_BP)
  })

  it('costs about a basis point of mean income at P3 band 5, where it binds', () => {
    expect(meanCostBpOf(P3_BAND_5)).toBeGreaterThan(0)
    expect(meanCostBpOf(P3_BAND_5)).toBeLessThan(2)
  })

  it('costs nothing at P10 band 5, whose hold no trip of finds passes', () => {
    expect(meanCostBpOf(P10_BAND_5)).toBe(0)
  })
})
