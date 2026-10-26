import { describe, expect, it } from 'vitest'
import { requiredCasingGrade } from '../economy/casingGrades'
import { ECONOMY } from '../economy/economy'
import { CASING_BREACHED, breachedValueOf, casingValueOf } from './chunkDelta'
import { collapseGradeOf } from './wallWeakness'

const CORE_BAND = ECONOMY.ore.coreTierBand
/** Any lining type but the standard one. */
const OTHER_TYPE_INDEX = 1

/** What a wall on planet 1 holding `casing` holds in `band`. */
function heldOnPlanet1(casing: number, band: number): bigint {
  return collapseGradeOf(1, casing, requiredCasingGrade({ planetIndex: 1, band }))
}

describe('wall weakness: the grade a wall holds against collapse (#676)', () => {
  it('holds intact lining at its own grade and never-lined rock at 0, whatever the band', () => {
    expect(heldOnPlanet1(casingValueOf(3, 0), 1)).toBe(3n)
    expect(heldOnPlanet1(casingValueOf(2, OTHER_TYPE_INDEX), CORE_BAND)).toBe(2n)
    expect(heldOnPlanet1(0, 4)).toBe(0n)
  })

  it('reads gnawed lining one grade under its band, never under grade 1', () => {
    expect([1, 2, 3, 4, 5, CORE_BAND].map((band) => heldOnPlanet1(CASING_BREACHED, band))).toEqual([
      1n,
      1n,
      2n,
      3n,
      4n,
      4n,
    ])
  })

  it('reads a gnawed lining of any type the same: the band decides, not what was laid', () => {
    const otherBreach = breachedValueOf(casingValueOf(9, OTHER_TYPE_INDEX))
    expect(otherBreach).not.toBe(CASING_BREACHED)
    expect(heldOnPlanet1(otherBreach, 3)).toBe(heldOnPlanet1(CASING_BREACHED, 3))
  })

  // Ticket 829: a sample's slot names a grade of its planet's window.
  it("reads a lining slot on planet 10 as a grade of that planet's window", () => {
    const required = requiredCasingGrade({ planetIndex: 10, band: 2 })
    expect(collapseGradeOf(10, casingValueOf(7, 0), required)).toBe(37n)
  })
})
