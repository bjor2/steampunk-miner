import { describe, expect, it } from 'vitest'
import { fuelPriceOf } from '../../economy/jumpFuel'
import { planetPriceRow } from '../../economy/economyTables'
import { add, fromCanonical, sub, toCanonical } from '../../money'
import { fuelOf } from '../../vehicle/vehicleFuel'
import type { DomainEvent } from '../domainEvent'
import { createScriptedSession, typesOf } from '../scriptedSession'

const setMoney = (amount: string) => ({ type: 'debug.setMoney', payload: { amount } }) as const
const buyFuel = (units: number) => ({ type: 'buyFuel', payload: { units } }) as const
const dockAt = (bay: 'sell' | 'upgrade') => ({ type: 'dock', payload: { bay } }) as const

const rejectionOf = (events: readonly DomainEvent[]) =>
  events[0].type === 'CommandRejected' ? events[0].reason : null

/** A vehicle docked at the Sell bay on planet 1 with `money` in the wallet. */
function dockedWith(money: string) {
  const session = createScriptedSession()
  session.submit(0, setMoney(money))
  session.submit(5, dockAt('sell'))
  return session
}

describe('fuel shop (ticket 755)', () => {
  it('fills the tank with the units bought and takes exactly their price', () => {
    const session = dockedWith('1e6')
    const events = session.submit(10, buyFuel(3))
    expect(toCanonical(fuelOf(session.vehicle()))).toBe(toCanonical(fromCanonical('3')))
    expect(toCanonical(session.state().players.p1.wallet)).toBe(
      toCanonical(sub(fromCanonical('1e6'), fuelPriceOf(1, 3))),
    )
    expect(typesOf(events)).toEqual(['FuelBought', 'MoneyChanged'])
    expect(events[0]).toMatchObject({
      units: 3,
      cost: toCanonical(fuelPriceOf(1, 3)),
      tank: '3e+0',
    })
  })

  it('adds to the fuel already in the tank', () => {
    const session = dockedWith('1e6')
    session.submit(10, buyFuel(2))
    session.submit(11, buyFuel(1))
    expect(toCanonical(fuelOf(session.vehicle()))).toBe('3e+0')
  })

  it('refuses a buy the wallet cannot pay, never trimming it, and changes nothing', () => {
    const session = dockedWith('100')
    const before = session.state()
    const events = session.submit(10, buyFuel(10))
    expect(rejectionOf(events)).toBe('money_short')
    expect(session.state()).toBe(before)
  })

  it('refuses a buy of no units', () => {
    expect(rejectionOf(dockedWith('1000').submit(10, buyFuel(0)))).toBe('out_of_range')
  })

  it('sells fuel only to a vehicle docked at the Sell bay', () => {
    expect(rejectionOf(createScriptedSession().submit(10, buyFuel(1)))).toBe('not_docked')
  })

  it('keeps an empty tank out of the state, so a vehicle that never bought fuel digests as before', () => {
    expect('fuel' in dockedWith('1000').vehicle()).toBe(false)
  })
})

/** Planet 1's next on-curve purchase, the cheaper of the next drill and tip (`travelCharge.ts`). */
const NEXT_ON_CURVE_P1 = planetPriceRow(1).drillTipNext

describe('fuel shop tank and clamp (ticket 756)', () => {
  it("refuses a buy past the tank's capacity with out_of_range, never trimming it", () => {
    const session = dockedWith('1e6')
    const before = session.state()
    expect(rejectionOf(session.submit(10, buyFuel(11)))).toBe('out_of_range')
    expect(session.state()).toBe(before)
    session.submit(11, buyFuel(10))
    expect(toCanonical(fuelOf(session.vehicle()))).toBe('1e+1')
    expect(rejectionOf(session.submit(12, buyFuel(1)))).toBe('out_of_range')
  })

  it("charges the next hop's fuel only what leaves the next on-curve purchase paid for", () => {
    const session = dockedWith(toCanonical(add(NEXT_ON_CURVE_P1, fromCanonical('100'))))
    const events = session.submit(10, buyFuel(5))
    expect(events[0]).toMatchObject({ units: 5, cost: toCanonical(fromCanonical('100')) })
    expect(toCanonical(session.state().players.p1.wallet)).toBe(toCanonical(NEXT_ON_CURVE_P1))
  })

  it("gives the next hop's fuel free to a wallet under the next on-curve purchase", () => {
    const session = dockedWith('500')
    const events = session.submit(10, buyFuel(5))
    expect(events[0]).toMatchObject({ units: 5, cost: '0e+0', tank: '5e+0' })
    expect(toCanonical(session.state().players.p1.wallet)).toBe('5e+2')
  })

  it('charges full price for fuel past the next hop, clamp or no clamp', () => {
    const session = dockedWith(toCanonical(add(NEXT_ON_CURVE_P1, fromCanonical('100'))))
    const events = session.submit(10, buyFuel(7))
    const cut = sub(fuelPriceOf(1, 5), fromCanonical('100'))
    expect(events[0]).toMatchObject({ cost: toCanonical(sub(fuelPriceOf(1, 7), cut)) })
  })

  it('stops clamping once the tank holds the next hop', () => {
    const session = dockedWith('1000')
    session.submit(10, buyFuel(5))
    expect(rejectionOf(session.submit(11, buyFuel(2)))).toBeNull()
    expect(toCanonical(session.state().players.p1.wallet)).toBe(
      toCanonical(sub(fromCanonical('1000'), fuelPriceOf(1, 2))),
    )
  })
})
