import { describe, expect, it } from 'vitest'
import { artDirectionProblems } from './artDirection'
import { oreGradeNameOf, oreGradeOf } from './oreGrade'

describe('ore grade (#140 thresholds)', () => {
  it('steps from Raw at tier 1 to Aether at tier 70, on the first tier of each grade', () => {
    expect([1, 3, 4, 11, 12, 29, 30, 69, 70, 124].map(oreGradeOf)).toEqual([
      1, 1, 2, 2, 3, 3, 4, 4, 5, 5,
    ])
    expect(oreGradeNameOf(12)).toBe('Crystal')
  })

  it('refuses thresholds that do not rise', () => {
    const problems = artDirectionProblems({ oreGrades: [4, 4, 30, 70] })
    expect(problems).toContain('oreGrades must be four rising whole tiers above 1')
  })
})
