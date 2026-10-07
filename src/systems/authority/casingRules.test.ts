import { describe, expect, it } from 'vitest'
import { visualTier } from '../economy/vehicleStats'
import { casingUpgradePrice } from '../economy/casingPrices'
import { add, fromCanonical, sub, toCanonical, ZERO_MONEY } from '../money'
import { buyCasingGradeCommand } from '../platform/platformCommands'
import type { DomainEvent } from './domainEvent'
import { createScriptedSession, dockInBay, typesOf } from './scriptedSession'
import { casingRefusal } from './casingRules'

const grant = (amount: string) => ({ type: 'debug.grantMoney', payload: { amount } }) as const

const rejectionOf = (events: readonly DomainEvent[]) =>
  events[0].type === 'CommandRejected' ? events[0].reason : null

function dockedWithMoney(money: string, bay: 'sell' | 'upgrade' = 'upgrade') {
  const session = createScriptedSession()
  session.submit(0, grant(money))
  dockInBay(session, 1, bay)
  return session
}

describe('casing grade', () => {
  it('starts at grade 1', () => {
    expect(createScriptedSession().vehicle().casingGrade).toBe(1)
  })

  it('ends at grade 5 after four buys, logging each and charging exactly its curve prices', () => {
    const session = dockedWithMoney('300')
    const fromGrades = [1, 2, 3, 4]
    const prices = fromGrades.map(casingUpgradePrice)
    const events = [2, 3, 4, 5].flatMap((tick) => session.submit(tick, buyCasingGradeCommand()))
    expect(events).toEqual(
      fromGrades.map((from, index) =>
        expect.objectContaining({
          type: 'CasingUpgraded',
          from,
          to: from + 1,
          price: toCanonical(prices[index]),
        }),
      ),
    )
    expect(session.vehicle().casingGrade).toBe(5)
    expect(session.state().players.p1.wallet).toEqual(
      sub(fromCanonical('300'), prices.reduce(add, ZERO_MONEY)),
    )
  })

  it('refuses the buy at the Sell bay with wrong_bay, changing nothing', () => {
    const session = dockedWithMoney('300', 'sell')
    const before = session.state().players
    expect(rejectionOf(session.submit(2, buyCasingGradeCommand()))).toBe('wrong_bay')
    expect(session.state().players).toEqual(before)
  })

  it('refuses a buy the wallet cannot pay with money_short, leaving the grade', () => {
    const session = dockedWithMoney('47.999')
    expect(rejectionOf(session.submit(2, buyCasingGradeCommand()))).toBe('money_short')
    expect(session.vehicle().casingGrade).toBe(1)
    expect(toCanonical(session.state().players.p1.wallet)).toBe('4.7999e+1')
  })

  it('refuses a vehicle that is not docked', () => {
    const session = createScriptedSession()
    session.submit(0, grant('300'))
    expect(casingRefusal(session.state(), 'p1')?.reason).toBe('not_docked')
  })

  it('never moves the visual tier: casing is not a vehicle track', () => {
    const session = dockedWithMoney('1e9')
    const ticks = Array.from({ length: 25 }, (_, index) => 2 + index)
    const events = ticks.flatMap((tick) => session.submit(tick, buyCasingGradeCommand()))
    expect(session.vehicle().casingGrade).toBe(26)
    expect(typesOf(events)).not.toContain('VehicleConfigurationChanged')
    expect(visualTier(session.vehicle().levels)).toBe(1)
  })
})
