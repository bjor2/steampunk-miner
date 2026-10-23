import { describe, expect, it } from 'vitest'
import { fuelTankPriceOf } from '../../economy/fuelTank'
import { fromCanonical, sub, toCanonical } from '../../money'
import { fuelTankLevelOf } from '../../vehicle/vehicleFuel'
import type { DomainEvent } from '../domainEvent'
import { createScriptedSession, typesOf } from '../scriptedSession'

const setMoney = (amount: string) => ({ type: 'debug.setMoney', payload: { amount } }) as const
const buyFuel = (units: number) => ({ type: 'buyFuel', payload: { units } }) as const
const buyFuelTank = { type: 'buyFuelTank', payload: {} } as const
const dockAtSell = { type: 'dock', payload: { bay: 'sell' } } as const

const rejectionOf = (events: readonly DomainEvent[]) =>
  events[0].type === 'CommandRejected' ? events[0].reason : null

/** A vehicle docked at the Sell bay on planet 1 with `money` in the wallet. */
function dockedWith(money: string) {
  const session = createScriptedSession()
  session.submit(0, setMoney(money))
  session.submit(5, dockAtSell)
  return session
}

describe('fuel tank track (ticket 756)', () => {
  it('raises the tank one level for its price and logs the level, cost and capacity', () => {
    const session = dockedWith('1e6')
    const events = session.submit(10, buyFuelTank)
    expect(fuelTankLevelOf(session.vehicle())).toBe(2)
    expect(typesOf(events)).toEqual(['FuelTankBought', 'MoneyChanged'])
    expect(events[0]).toMatchObject({ level: 2, cost: '2.5e+2', capacity: '1.3e+1' })
    expect(toCanonical(session.state().players.p1.wallet)).toBe(
      toCanonical(sub(fromCanonical('1e6'), fuelTankPriceOf(1))),
    )
  })

  it('prices each next level 1.3 times the one before, with no top level', () => {
    const session = dockedWith('1e9')
    session.submit(10, buyFuelTank)
    expect(session.submit(11, buyFuelTank)[0]).toMatchObject({ level: 3, cost: '3.25e+2' })
    for (let tick = 12; tick < 42; tick++) session.submit(tick, buyFuelTank)
    expect(fuelTankLevelOf(session.vehicle())).toBe(33)
  })

  it('lets a bigger tank take the fuel the starting tank refused', () => {
    const session = dockedWith('1e6')
    expect(rejectionOf(session.submit(10, buyFuel(13)))).toBe('out_of_range')
    session.submit(11, buyFuelTank)
    expect(rejectionOf(session.submit(12, buyFuel(13)))).toBeNull()
  })

  it('refuses a level the wallet cannot pay and changes nothing', () => {
    const session = dockedWith('100')
    const before = session.state()
    expect(rejectionOf(session.submit(10, buyFuelTank))).toBe('money_short')
    expect(session.state()).toBe(before)
  })

  it('sells the tank only to a vehicle docked at the Sell bay', () => {
    expect(rejectionOf(createScriptedSession().submit(10, buyFuelTank))).toBe('not_docked')
  })

  it('keeps the starting tank out of the state, so a vehicle that never bought one digests as before', () => {
    expect('fuelTankLevel' in dockedWith('1e6').vehicle()).toBe(false)
  })
})
