import { describe, expect, it } from 'vitest'
import { casingLadderOf } from '../economy/casingGrades'
import { deepestBandHeldOnLadder, isGradeShortOnLadder } from './botCasing'

// Ticket 829's bot rows: the bot buys the grade a band asks before its trip reaches it, four a
// planet, and a +1 biome's grade before the pocket (a fixture ladder: no shipped biome adds one).

const PLANET_6 = casingLadderOf(6)
const PLUS_ONE_BIOME = { surfaceGrade: PLANET_6.surfaceGrade, biomeDelta: 1 }

describe('pacing bot casing on the ladder (ticket 829)', () => {
  it('holds only the surface band of planet 6 with the bottom grade of planet 5', () => {
    expect(deepestBandHeldOnLadder(PLANET_6, casingLadderOf(5).surfaceGrade + 4n)).toBe(1)
  })

  it('holds one more band with each of the four grades it buys on planet 6', () => {
    const grades = [22n, 23n, 24n, 25n]
    expect(grades.map((grade) => deepestBandHeldOnLadder(PLANET_6, grade))).toEqual([2, 3, 4, 5])
    expect(isGradeShortOnLadder(PLANET_6, 25n, 6)).toBe(false)
  })

  it('wants the +1 grade of a biome before its trip reaches the biome ground below band 1', () => {
    expect(isGradeShortOnLadder(PLUS_ONE_BIOME, 22n, 2)).toBe(true)
    expect(isGradeShortOnLadder(PLUS_ONE_BIOME, 23n, 2)).toBe(false)
    expect(isGradeShortOnLadder(PLUS_ONE_BIOME, 21n, 1)).toBe(false)
    expect(deepestBandHeldOnLadder(PLUS_ONE_BIOME, 22n)).toBe(1)
  })
})
