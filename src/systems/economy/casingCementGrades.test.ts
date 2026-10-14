import { describe, expect, it } from 'vitest'
import { fromCanonical, mul, toCanonical } from '../money'
import { LOCKED_SCHEDULE } from '../unlocks/unlockSchedule'
import { liningRowIdOf } from '../vehicle/liningType'
import { bandOrePrice } from './bandOreCost'
import { cementGradeOreCostOf, type CasingCementGrades } from './casingCementGrades'
import {
  cementGradeCount,
  cementGradeOf,
  cementGradePrice,
  liningTypeUnlockPrice,
} from './casingPrices'
import { compoundRatio } from './curveFamilies'
import { ECONOMY } from './economy'

const GRADES = ECONOMY.casing.cementGrades

/** A ladder longer than the depth cap, to show where the price stops growing. */
const LONG_LADDER: CasingCementGrades = {
  ...GRADES,
  liningTypes: Array.from({ length: GRADES.gradeDepthCap + 4 }, (_, index) => `type${index}`),
}

function planetOfRow(rowId: string): number | undefined {
  return LOCKED_SCHEDULE.rows.find((row) => row.id === rowId)?.planetIndex
}

function oreUnitsOf(grades: CasingCementGrades, grade: number): string {
  return toCanonical(cementGradeOreCostOf(grades, grade).oreUnits)
}

describe('casing_cement grades', () => {
  it('reads refractory, insulated and grounded as grades 1 to 3 on their P8, P17 and P25 rows', () => {
    const types = ['refractory', 'insulated', 'grounded']
    expect(types.map(cementGradeOf)).toEqual([1, 2, 3])
    expect(types.map((type) => planetOfRow(liningRowIdOf(type)))).toEqual([8, 17, 25])
  })

  it('gives the standard lining no grade and no price', () => {
    expect(cementGradeOf('standard')).toBeNull()
    expect(liningTypeUnlockPrice('standard', 25)).toEqual(fromCanonical('0'))
  })

  it('has a fixed count of three grades and refuses any grade outside it', () => {
    expect(cementGradeCount()).toBe(3)
    expect(() => cementGradePrice(0, 8)).toThrow(RangeError)
    expect(() => cementGradePrice(4, 25)).toThrow(RangeError)
  })

  it('prices grades at 40, 41.6 and 43.264 band-5 ore units on the Mark curve', () => {
    expect([1, 2, 3].map((grade) => oreUnitsOf(GRADES, grade))).toEqual([
      '4e+1',
      '4.16e+1',
      '4.3264e+1',
    ])
    expect(cementGradeOreCostOf(GRADES, 3).band).toBe(5)
  })

  it('keeps refractory at its 40-unit unlock price as grade 1', () => {
    const forty = { band: 5, oreUnits: fromCanonical('40') }
    expect(liningTypeUnlockPrice('refractory', 8)).toEqual(bandOrePrice(forty, 8))
    expect(cementGradePrice(1, 12)).toEqual(liningTypeUnlockPrice('refractory', 12))
  })

  it('stops raising the multiplier at the depth cap, so the price is bounded', () => {
    const cap = GRADES.gradeDepthCap
    const ceiling = mul(GRADES.gradeCost.oreUnits, compoundRatio(GRADES.gradeRatio, cap))
    expect(oreUnitsOf(LONG_LADDER, cap + 1)).toBe(toCanonical(ceiling))
    expect(oreUnitsOf(LONG_LADDER, cap + 4)).toBe(toCanonical(ceiling))
    expect(oreUnitsOf(LONG_LADDER, cap)).not.toBe(toCanonical(ceiling))
  })

  it('never scales a grade with depth: its units are the same on every planet', () => {
    const units = [1, 8, 17, 25, 40].map(() => oreUnitsOf(GRADES, 2))
    expect(new Set(units).size).toBe(1)
  })
})
