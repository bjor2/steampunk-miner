import { describe, expect, it } from 'vitest'
import { ECONOMY } from '../economy/economy'
import { requiredCasingGrade } from '../economy/casingGrades'
import { casingGradeLookOf } from '../render/casingGradeLook'
import { depthBandTintOf } from './depthBandTint'

// CG2 (ticket 830): the depth dial takes the plate colour of the grade the rig's band needs.

describe('depth gauge band tint (ticket 830)', () => {
  it('tints each band with the plate of the grade it needs', () => {
    for (const band of [1, 2, 3, 4, 5]) {
      expect(depthBandTintOf(band)).toBe(casingGradeLookOf(requiredCasingGrade(band)).plate.colour)
    }
    expect(depthBandTintOf(1)).toBe('#dcb35a')
  })

  it("tints the core's band with the core's least grade", () => {
    const core = ECONOMY.ore.coreTierBand
    expect(depthBandTintOf(core)).toBe(
      casingGradeLookOf(ECONOMY.casing.casingGradeCoreMin).plate.colour,
    )
  })

  it('shows no tint off a planet or above the first band', () => {
    expect(depthBandTintOf(null)).toBeNull()
    expect(depthBandTintOf(0)).toBeNull()
  })

  it('never gives two neighbouring bands the same tint', () => {
    const tints = [1, 2, 3, 4, 5].map(depthBandTintOf)
    tints.slice(1).forEach((tint, at) => expect(tint).not.toBe(tints[at]))
  })
})
