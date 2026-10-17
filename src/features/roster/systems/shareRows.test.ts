import { describe, expect, it } from 'vitest'
import economyFile from '../roster.economy.json'
import { readShareRows, SHARE_ROWS } from './shareRows'

// Ticket 449's bounds are Systems' block verbatim (#139, 6203159815; 650 bp per tier since
// 6203640346), and a broken file is refused whole with every problem listed.

describe('rarity share rows', () => {
  it("reads Systems' rarityShareBp block as posted, the tier bound at 650 bp", () => {
    expect(SHARE_ROWS.bounds).toEqual({
      perNonCommonKindMax: 1500,
      perNonCommonTierMax: 650,
      epicPlusMythicTripClampBp: 1500,
      perCommonKindMaxOfBandTrip: 5000,
      perCommonKindMaxOfPlanet: 4000,
    })
  })

  it('refuses a file missing a bound or a trip bound, naming each', () => {
    const { rarityShareBp, trip, ...rest } = economyFile.shares
    const broken = {
      shares: {
        ...rest,
        rarityShareBp: { ...rarityShareBp, perNonCommonTierMax: '650' },
        trip: { ...trip, cvMaxBp: undefined },
      },
    }
    expect(readShareRows(broken)).toEqual({
      problems: [
        'rarityShareBp.perNonCommonTierMax must be a safe integer',
        'trip.cvMaxBp must be a safe integer',
      ],
    })
  })
})
