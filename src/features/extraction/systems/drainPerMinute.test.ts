import { describe, expect, it } from 'vitest'
import { oreTier, oreValue } from '../../../systems/economy/oreEconomy'
import { cmp, fromSafeInteger, mul, type Money } from '../../../systems/money'
import { drainAtEveryMark, drainForAMinute } from './drainIncomeRate'
import { EXTRACTION_ECONOMY } from './extractionEconomy'

// The GD ruling on #201 Q3: until a buy path lets the pacing bot own the drain, acceptance 4 is
// judged here. Whatever Mark the drain is researched to, the ore it moves in any minute stays at or
// under 15% of a full hold of the band's ore, on every planet from 1 to 40 and every band.

const LAST_SCHEDULED_PLANET = 40
const BAND_COUNT = 5
const HOLDS = [12, 24, 96]

describe('mineral drain per minute', () => {
  it('moves at most 15% of a full hold of the band ore in a minute at every Mark, P1 to P40', () => {
    const overruns: string[] = []
    for (const drain of drainAtEveryMark()) {
      for (let planet = 1; planet <= LAST_SCHEDULED_PLANET; planet++) {
        for (let band = 1; band <= BAND_COUNT; band++) {
          for (const hold of HOLDS) {
            const moved = drainForAMinute(drain, planet, band, hold)
            if (cmp(moved, fifteenPercentOf(planet, band, hold)) > 0) {
              overruns.push(`Mark ${drain.mark} P${planet} band ${band} hold ${hold}`)
            }
          }
        }
      }
    }
    expect(overruns).toEqual([])
  })

  it('takes more cells per use and more uses a minute at its last Mark than as bought', () => {
    const marks = drainAtEveryMark()
    const [bought, last] = [marks[0], marks[marks.length - 1]]
    expect(last.cellsPerUse).toBeGreaterThan(bought.cellsPerUse)
    expect(last.usesPerMinute).toBeGreaterThan(bought.usesPerMinute)
  })
})

/** 15% of a full hold of the band's ore, unrounded (#162 4.5). */
function fifteenPercentOf(planet: number, band: number, hold: number): Money {
  const fullHold = mul(fromSafeInteger(hold), oreValue(oreTier(planet, band)))
  return mul(EXTRACTION_ECONOMY.income.tripCapShare, fullHold)
}
