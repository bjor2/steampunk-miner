import { describe, expect, it } from 'vitest'
import type { PortableState } from '../authority/sessionSnapshot'
import { withSizedChargeRacks } from './sizedChargeRacks'

/** A snapshot 19 state, as far as the reshape reads it: one player and the rack it wrote. */
function snapshot19With(charges: Record<string, unknown>): PortableState {
  return { players: { p1: { vehicle: { charges } } } } as unknown as PortableState
}

function chargesOf(state: PortableState): unknown {
  return state.players.p1.vehicle.charges
}

describe('save migration: snapshot 19 -> 20 charge racks (K8 #218)', () => {
  it('carries every charge of an old rack as size 1, the only size there was', () => {
    const old = { isRackMounted: true, slotLevel: 2, carried: 4, planted: null }
    expect(chargesOf(withSizedChargeRacks(snapshot19With(old)))).toEqual({
      isRackMounted: true,
      slotLevel: 2,
      carriedBySize: { '1': 4 },
      planted: null,
    })
  })

  it('keeps no key for an empty rack', () => {
    const old = { isRackMounted: false, slotLevel: 0, carried: 0, planted: null }
    expect(chargesOf(withSizedChargeRacks(snapshot19With(old)))).toMatchObject({
      carriedBySize: {},
    })
  })

  it('sizes a planted charge as size 1, planted the shipped fuse before it blows', () => {
    const planted = { tx: 3, ty: 280, detonateTick: 720 }
    const old = { isRackMounted: true, slotLevel: 0, carried: 2, planted }
    expect(chargesOf(withSizedChargeRacks(snapshot19With(old)))).toMatchObject({
      planted: { tx: 3, ty: 280, size: 1, plantedTick: 600, detonateTick: 720 },
    })
  })
})
