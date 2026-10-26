import { describe, expect, it } from 'vitest'
import { requiredCasingGrade } from '../economy/casingGrades'
import { casingGradeLookOf } from '../render/casingGradeLook'
import { depthBandTintOf } from './depthBandTint'

// CG2 (ticket 830): the depth dial takes the plate colour of the grade the rig's band needs; since
// ticket 829 that grade is the ladder's, so the same band reads another metal a planet on.

describe('depth gauge band tint (ticket 830)', () => {
  it('tints each band with the plate of the grade it needs', () => {
    for (const band of [1, 2, 3, 4, 5, 6]) {
      const grade = requiredCasingGrade({ planetIndex: 2, band })
      expect(depthBandTintOf(grade)).toBe(casingGradeLookOf(Number(grade)).plate.colour)
    }
    expect(depthBandTintOf(1n)).toBe('#dcb35a')
  })

  it('shows no tint off a planet or above the first band', () => {
    expect(depthBandTintOf(null)).toBeNull()
  })

  it('never gives two neighbouring bands the same tint', () => {
    const tints = [1, 2, 3, 4, 5].map((band) =>
      depthBandTintOf(requiredCasingGrade({ planetIndex: 1, band })),
    )
    tints.slice(1).forEach((tint, at) => expect(tint).not.toBe(tints[at]))
  })
})
