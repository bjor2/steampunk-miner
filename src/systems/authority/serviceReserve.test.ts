import { describe, expect, it } from 'vitest'
import { chargePrice } from '../economy/chargeSizes'
import { travelFee } from '../economy/planetCharges'
import { add, ZERO_MONEY } from '../money'
import { chargesThatFitOf } from '../vehicle/vehicleCharges'
import type { CommandIntent } from './authorityCommand'
import { coreNeededOf } from './coreBay'
import { rechargeCostOf, repairCostOf } from './platformServices'
import { createScriptedSession } from './scriptedSession'
import { serviceReserveOf } from './serviceReserve'

const setPlanet = (planetIndex: number): CommandIntent => ({
  type: 'debug.setPlanet',
  payload: { planetIndex },
})

describe('service reserve (#180 spend safety)', () => {
  it('keeps nothing back for a whole, full vehicle with no rack', () => {
    const session = createScriptedSession()
    expect(serviceReserveOf(session.state(), 'p1')).toEqual(ZERO_MONEY)
  })

  it('keeps back the repair of the current damage and the recharge of the missing energy', () => {
    const session = createScriptedSession()
    session.submit(0, { type: 'debug.setHull', payload: { hull: '40' } })
    session.submit(0, { type: 'debug.setEnergy', payload: { energy: '30' } })
    const state = session.state()
    expect(serviceReserveOf(state, 'p1')).toEqual(
      add(repairCostOf(state, 'p1'), rechargeCostOf(state, 'p1')),
    )
  })

  it("adds filling the rack the vehicle carries with size-1 charges at this planet's price", () => {
    const session = createScriptedSession()
    session.submit(0, setPlanet(7))
    session.submit(0, { type: 'debug.setCharges', payload: { size: 1, carried: 1, slotLevel: 2 } })
    const empty = chargesThatFitOf(session.vehicle().charges, 1)
    expect(empty).toBeGreaterThan(0)
    expect(serviceReserveOf(session.state(), 'p1')).toEqual(chargePrice(1, empty, 7))
  })

  it('adds the travel fee once the bay holds the core fragments the travel gate asks for', () => {
    const session = createScriptedSession()
    const needed = coreNeededOf(session.state().planet) ?? 0
    session.submit(0, { type: 'debug.setCoreFragments', payload: { count: needed - 1 } })
    expect(serviceReserveOf(session.state(), 'p1')).toEqual(ZERO_MONEY)
    session.submit(1, { type: 'debug.setCoreFragments', payload: { count: needed } })
    expect(serviceReserveOf(session.state(), 'p1')).toEqual(travelFee(1))
  })
})
