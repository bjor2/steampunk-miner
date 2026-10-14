import { describe, expect, it } from 'vitest'
import { fromCanonical } from '../../../systems/money'
import { COMBOS_ECONOMY, readCombosEconomy } from './combosEconomy'

describe('combos economy', () => {
  it('reads the one-off price as 15 band-5 ore units (#162 4.1)', () => {
    expect(COMBOS_ECONOMY.price).toEqual({ band: 5, oreUnits: fromCanonical('15') })
  })

  it('reads the share of the headroom each grade closes, in bp (GD lock on #206)', () => {
    expect(COMBOS_ECONOMY.grades).toEqual({ headroomShareBp: 5000 })
  })

  it('refuses a file whose price is broken', () => {
    const reading = readCombosEconomy({
      items: { price: { band: 5, oreUnits: -15 } },
      grades: { headroomShareBp: 5000 },
    })
    expect('problems' in reading && reading.problems.length).toBeGreaterThan(0)
  })

  it('refuses a grade share outside 0 to 10000 bp', () => {
    const reading = readCombosEconomy({
      items: { price: { band: 5, oreUnits: '15' } },
      grades: { headroomShareBp: 12_000 },
    })
    expect(reading).toEqual({ problems: ['grades.headroomShareBp must be 0 to 10000'] })
  })
})
