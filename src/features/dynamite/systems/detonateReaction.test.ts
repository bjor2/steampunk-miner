import { describe, expect, it } from 'vitest'
import type { AuthorityState } from '../../../systems/authority/authorityState'
import { plantSized, sizedBlasterOn } from '../../../systems/authority/charges/chargeFixtures'
import { reactionToPress, type InputSituation } from '../../../systems/input/inputRouting'

/** Driving on `state` with nothing the kernel would plant (a charge live, or none carried). */
function drivingOn(state: AuthorityState): InputSituation {
  return {
    layer: 'vehicle',
    vehicleMode: 'active',
    dockableBay: null,
    dockedBay: null,
    canOpenArtefactCache: false,
    gunMode: null,
    plantableChargeSize: null,
    nextChargeSize: null,
    isStarMapOpen: false,
    state,
    playerId: 'p1',
  }
}

function liveChargeOn(planet: number, size: number): AuthorityState {
  const blaster = sizedBlasterOn(planet, size)
  plantSized(blaster.session, blaster, size, 1)
  return blaster.session.state()
}

const DETONATE = { kind: 'submit', intent: { type: 'dynamite.detonate_charge', payload: {} } }

describe('dynamite plunger: the plant key', () => {
  it('detonates the live charge, inside the interlock too, so the clunk is logged', () => {
    expect(reactionToPress('plant_charge', drivingOn(liveChargeOn(22, 6)))).toEqual(DETONATE)
    expect(reactionToPress('plant_charge', drivingOn(liveChargeOn(25, 7)))).toEqual(DETONATE)
  })

  it('offers Detonate on every planet, P1 too: no planet opens the plunger (D4 #863)', () => {
    expect(reactionToPress('plant_charge', drivingOn(liveChargeOn(1, 7)))).toEqual(DETONATE)
    expect(reactionToPress('plant_charge', drivingOn(liveChargeOn(19, 5)))).toEqual(DETONATE)
  })

  it('does nothing with no live charge, and still plants whatever the kernel can plant', () => {
    const { session } = sizedBlasterOn(22, 6)
    expect(reactionToPress('plant_charge', drivingOn(session.state()))).toEqual({ kind: 'none' })
    expect(
      reactionToPress('plant_charge', { ...drivingOn(session.state()), plantableChargeSize: 6 }),
    ).toEqual({ kind: 'submit', intent: { type: 'plantCharge', payload: { size: 6 } } })
  })
})
