import { describe, expect, it } from 'vitest'
import { fromCanonical, fromSafeInteger, mul } from '../money'
import { ENERGY_QUANTA_PER_TICK } from '../vehicle/energyQuanta'
import {
  casingHardness,
  gnawedCasingGrade,
  GNAWED_GRADE_FLOOR,
  isCasingGradeEnough,
  requiredCasingGrade,
} from './casingGrades'
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

describe('casing grades: the gnaw floor (#676, TD pin)', () => {
  it('keeps gnawMaxDrop in data as one whole number of grades, 1 by the ruling', () => {
    expect(ECONOMY.casing.gnawMaxDrop).toBe(1)
    expect(GNAWED_GRADE_FLOOR).toBe(1)
  })

  it('reads a gnawed wall of native grade 1, 3 and 5 with gnawMaxDrop 1 one grade lower, floored at 1', () => {
    expect([1, 3, 5].map((native) => gnawedCasingGrade(native, 1, 1))).toEqual([1, 2, 4])
  })

  it('reads a gnawed wall of native grade 1, 3 and 5 with gnawMaxDrop 0 at its native grade', () => {
    expect([1, 3, 5].map((native) => gnawedCasingGrade(native, 1, 0))).toEqual([1, 3, 5])
  })

  it('takes the data gnawMaxDrop when none is given', () => {
    expect(gnawedCasingGrade(3, 1)).toBe(gnawedCasingGrade(3, 1, ECONOMY.casing.gnawMaxDrop))
  })

  it('never reads a gnawed wall below grade 1, nor more than gnawMaxDrop below its native grade', () => {
    for (let native = 1; native <= 6; native++) {
      for (let gnaws = 0; gnaws <= 4; gnaws++) {
        for (let maxDrop = 0; maxDrop <= 3; maxDrop++) {
          const grade = gnawedCasingGrade(native, gnaws, maxDrop)
          expect(grade).toBeGreaterThanOrEqual(1)
          expect(grade).toBeGreaterThanOrEqual(native - maxDrop)
          expect(grade).toBeLessThanOrEqual(native)
        }
      }
    }
  })
})
