import { describe, expect, it } from 'vitest'
import { fromCanonical, fromSafeInteger, mul } from '../money'
import { ENERGY_QUANTA_PER_TICK } from '../vehicle/energyQuanta'
import { casingHardness, isCasingGradeEnough, requiredCasingGrade } from './casingGrades'
import { ECONOMY } from './economy'
import { blockHardness } from './oreEconomy'

describe('casing grades', () => {
  it('exposes the core grade and the informational lift multiplier', () => {
    expect(ECONOMY.casing.casingGradeCoreMin).toBe(5)
    expect(ECONOMY.energy.drillUpEnergyMult).toEqual(fromCanonical('2.5'))
  })

  it('makes lining as hard as the band of its grade on the current planet', () => {
    expect(casingHardness(1, 3)).toEqual(blockHardness(1, 3))
    expect(casingHardness(2, 5)).toEqual(blockHardness(2, 5))
  })

  it('needs grade b for band b and grade 5 for the core', () => {
    expect(isCasingGradeEnough(1, 1)).toBe(true)
    expect(isCasingGradeEnough(1, 2)).toBe(false)
    expect(isCasingGradeEnough(4, 4)).toBe(true)
    expect(requiredCasingGrade(ECONOMY.ore.coreTierBand)).toBe(5)
    expect(isCasingGradeEnough(4, ECONOMY.ore.coreTierBand)).toBe(false)
  })

  it('records drillUpEnergyMult as what lift + drill already drain: thrust plus drill rates', () => {
    const { drill, thrust } = ENERGY_QUANTA_PER_TICK
    expect(fromSafeInteger(drill + thrust)).toEqual(
      mul(ECONOMY.energy.drillUpEnergyMult, fromSafeInteger(drill)),
    )
  })

  it('refuses a grade below 1 or a fractional grade', () => {
    expect(() => casingHardness(1, 0)).toThrow(RangeError)
    expect(() => casingHardness(1, 1.5)).toThrow(RangeError)
  })
})
