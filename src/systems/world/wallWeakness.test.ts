import { describe, expect, it } from 'vitest'
import { ECONOMY } from '../economy/economy'
import { CASING_BREACHED, breachedValueOf, casingValueOf } from './chunkDelta'
import { collapseGradeOf } from './wallWeakness'

const CORE_BAND = ECONOMY.ore.coreTierBand
/** Any lining type but the standard one. */
const OTHER_TYPE_INDEX = 1

describe('wall weakness: the grade a wall holds against collapse (#676)', () => {
  it('holds intact lining at its own grade and never-lined rock at 0, whatever the band', () => {
    expect(collapseGradeOf(casingValueOf(3, 0), 1)).toBe(3)
    expect(collapseGradeOf(casingValueOf(2, OTHER_TYPE_INDEX), CORE_BAND)).toBe(2)
    expect(collapseGradeOf(0, 4)).toBe(0)
  })

  it('reads gnawed lining one grade under its band, never under grade 1', () => {
    expect(
      [1, 2, 3, 4, 5, CORE_BAND].map((band) => collapseGradeOf(CASING_BREACHED, band)),
    ).toEqual([1, 1, 2, 3, 4, 4])
  })

  it('reads a gnawed lining of any type the same: the band decides, not what was laid', () => {
    const otherBreach = breachedValueOf(casingValueOf(9, OTHER_TYPE_INDEX))
    expect(otherBreach).not.toBe(CASING_BREACHED)
    expect(collapseGradeOf(otherBreach, 3)).toBe(collapseGradeOf(CASING_BREACHED, 3))
  })
})
