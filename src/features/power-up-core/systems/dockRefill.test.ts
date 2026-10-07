import { describe, expect, it } from 'vitest'
import type { DomainEvent } from '../../../systems/authority/domainEvent'
import { dockInBay, type ScriptedSession } from '../../../systems/authority/scriptedSession'
import { sub, toCanonical } from '../../../systems/money'
import { FAKE, inField } from '../fakeItems'
import { chargesLeftOf } from './chargeState'
import { intentToUseSlot } from './slotUse'

// Charges snap back free on the paid recharge (#200 acceptance 5, Systems on #200): the refill
// logs its charges after, and the bill is what it was.

const grant = { type: 'debug.grantMoney', payload: { amount: '100' } } as const
const halfTank = { type: 'debug.setEnergy', payload: { energy: '37.5' } } as const
const recharge = { type: 'rechargeEnergy', payload: {} } as const

const SLOTS = { 'powerup.1': FAKE.charged, 'powerup.2': FAKE.consumable }

/** Uses the slots named, then docks at Sell with half a tank and pays for a recharge. */
function rechargeAfterUsing(slots: readonly ('powerup.1' | 'powerup.2')[]) {
  return inField(
    (session) => {
      session.submit(2, grant)
      slots.forEach((slot, index) => session.submit(10 + index * 20, intentToUseSlot(slot)))
      session.advanceTo(60)
      session.submit(61, halfTank)
      dockInBay(session, 62, 'sell')
      const before = walletOf(session)
      const events = session.submit(63, recharge)
      return {
        events,
        bill: toCanonical(sub(before, walletOf(session))),
        charged: chargesLeftOf(session.state(), 'p1', FAKE.charged),
        consumable: chargesLeftOf(session.state(), 'p1', FAKE.consumable),
      }
    },
    { slots: SLOTS },
  )
}

const walletOf = (session: ScriptedSession) => session.state().players.p1.wallet

const refills = (events: readonly DomainEvent[]) =>
  events.filter((event) => event.type === 'power-up-core.ChargesRefilled')

describe('power-up dock refill', () => {
  it('refills a spent charged item with the recharge and says the charges after', () => {
    const { events, charged } = rechargeAfterUsing(['powerup.1'])
    expect(refills(events)).toEqual([
      {
        playerId: 'p1',
        tick: 63,
        seq: expect.any(Number),
        type: 'power-up-core.ChargesRefilled',
        itemId: FAKE.charged,
        chargesLeft: 2,
      },
    ])
    expect(charged).toBe(2)
  })

  it('charges the same recharge bill with or without charges to refill', () => {
    expect(rechargeAfterUsing(['powerup.1']).bill).toBe(rechargeAfterUsing([]).bill)
  })

  it('leaves a consumable stack as it is: crates are bought, not refilled', () => {
    const { events, consumable } = rechargeAfterUsing(['powerup.2'])
    expect(refills(events)).toEqual([])
    expect(consumable).toBe(2)
  })

  it('refills nothing and logs nothing when nothing was spent', () => {
    expect(refills(rechargeAfterUsing([]).events)).toEqual([])
  })
})
