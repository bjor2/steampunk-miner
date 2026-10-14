import { describe, expect, it } from 'vitest'
import { COMBOS_ECONOMY } from './combosEconomy'
import { closedHeadroomAt, closedHeadroomBpAt } from './comboGrades'

const GRADES = Array.from({ length: 30 }, (_, index) => index + 1)

describe('combo grades', () => {
  it('closes half of what is left of a headroom per grade, in whole bp', () => {
    expect(COMBOS_ECONOMY.grades.headroomShareBp).toBe(5000)
    expect([0, 1, 2, 3].map((grade) => closedHeadroomBpAt(grade))).toEqual([0, 5000, 7500, 8750])
  })

  it('closes more at every grade until the headroom is gone, never past it', () => {
    const closed = [0, ...GRADES].map((grade) => closedHeadroomBpAt(grade))
    closed.slice(1).forEach((bp, index) => {
      expect(bp).toBeLessThanOrEqual(10_000)
      expect(bp === 10_000 || bp > closed[index]).toBe(true)
    })
  })

  it('reads the same fixed share whatever the share is set to', () => {
    expect(closedHeadroomBpAt(2, 2000)).toBe(3600)
    expect(closedHeadroomBpAt(5, 0)).toBe(0)
    expect(closedHeadroomBpAt(1, 10_000)).toBe(10_000)
  })

  it('turns the closed share into whole cells of a headroom, never more than it holds', () => {
    expect([1, 2, 3, 4].map((grade) => closedHeadroomAt(grade, 12))).toEqual([6, 9, 10, 11])
    GRADES.forEach((grade) => expect(closedHeadroomAt(grade, 9)).toBeLessThanOrEqual(9))
    expect(closedHeadroomAt(3, -2)).toBe(0)
  })
})
