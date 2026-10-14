import { describe, expect, it } from 'vitest'
import { isSightPickDue, restingBearingOf } from './sightAim'

const RETARGET_TICKS = 30
const FACING_EAST = 255

describe('ground-gun: the gimbal sight on an unaimed shot (ticket 318)', () => {
  it('looks on its first frame, then holds its pick until the retarget wait runs out', () => {
    const pick = { pickedTick: 100, bearing: 200 }
    expect(isSightPickDue(null, 100, RETARGET_TICKS)).toBe(true)
    expect(isSightPickDue(pick, 129, RETARGET_TICKS)).toBe(false)
    expect(isSightPickDue(pick, 130, RETARGET_TICKS)).toBe(true)
  })

  it('looks again when the clock goes back, as after a load', () => {
    expect(isSightPickDue({ pickedTick: 100, bearing: 200 }, 40, RETARGET_TICKS)).toBe(true)
  })

  it("fires on the sight's pick, and along the facing with no sight or no ore in reach", () => {
    expect(restingBearingOf({ pickedTick: 0, bearing: 200 }, FACING_EAST)).toBe(200)
    expect(restingBearingOf({ pickedTick: 0, bearing: null }, FACING_EAST)).toBe(FACING_EAST)
    expect(restingBearingOf(null, FACING_EAST)).toBe(FACING_EAST)
  })
})
