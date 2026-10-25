import { describe, expect, it } from 'vitest'
import { plantSized, sizedBlasterOn } from '../../../systems/authority/charges/chargeFixtures'
import { liveChargeRingsOf } from '../index'

describe('dynamite charge rings (ticket 860)', () => {
  it('draws no ring before a charge is planted', () => {
    const { session } = sizedBlasterOn(16, 4)
    expect(liveChargeRingsOf(session.state(), 'p1')).toBeNull()
  })

  it("rings a live charge at its rung's danger zone and the ground it will clear, one ring at level 0", () => {
    const blaster = sizedBlasterOn(16, 4)
    plantSized(blaster.session, blaster, 4, 1)
    expect(liveChargeRingsOf(blaster.session.state(), 'p1')).toEqual({
      ...blaster.wall,
      baseRadiusMm: 6000,
      groundRadiusMm: 6000,
    })
  })
})
