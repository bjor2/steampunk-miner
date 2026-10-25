import { describe, expect, it } from 'vitest'
import type { DomainEvent } from '../systems/authority/domainEvent'
import { createScriptedSession, dockInBay } from '../systems/authority/scriptedSession'
import { CLICK_CHAIN } from '../systems/authority/purchaseChain'
import { toCanonical } from '../systems/money'
import { buyCasingGradeCommand } from '../systems/platform/platformCommands'
import { emptyCasingSpendTally, tallyCasingSpendStep, type CasingSpendTally } from './casingSpend'

const grantMoney = (amount: string) => ({ type: 'debug.setMoney', payload: { amount } }) as const

/** A session whose every step folds into the tally, as a bot run's listener does. */
function foldedSession() {
  const session = createScriptedSession()
  const tally = emptyCasingSpendTally()
  const fold = (events: DomainEvent[]) => {
    tallyCasingSpendStep(tally, session.state(), 'p1', events)
    return events
  }
  return { session, tally, fold }
}

function planetOne(tally: CasingSpendTally) {
  const planet = tally.planets.get(1)
  if (planet === undefined) throw new Error('planet 1 was never folded')
  return planet
}

function dockedWithMoney(amount: string) {
  const folded = foldedSession()
  folded.fold(folded.session.submit(0, grantMoney(amount)))
  folded.fold(dockInBay(folded.session, 1, 'upgrade'))
  return folded
}

describe('casing spend tally (#894)', () => {
  it('counts a grade buy as casing and as spend', () => {
    const { session, tally, fold } = dockedWithMoney('1000')
    fold(session.submit(2, buyCasingGradeCommand(CLICK_CHAIN)))
    expect(toCanonical(planetOne(tally).casingSpend)).toBe('2.4e+2')
    expect(toCanonical(planetOne(tally).spend)).toBe('2.4e+2')
  })

  it('never counts set-up money or fuel as spend', () => {
    const { session, tally, fold } = foldedSession()
    fold(session.submit(0, grantMoney('1000')))
    fold(session.submit(1, { type: 'dock', payload: { bay: 'sell' } }))
    fold(session.submit(2, { type: 'buyFuel', payload: { units: 5 } }))
    expect(toCanonical(planetOne(tally).spend)).toBe('0e+0')
  })

  it('counts lining paid out of a sale as casing and spend, though the wallet rose', () => {
    const { session, tally, fold } = dockedWithMoney('1000')
    const settled = { type: 'LiningSettled', billed: '7', paid: '7', forgiven: '0' } as const
    fold([{ ...session.events()[0], ...settled } as DomainEvent])
    expect(toCanonical(planetOne(tally).casingSpend)).toBe('7e+0')
    expect(toCanonical(planetOne(tally).spend)).toBe('7e+0')
  })

  it('records the money held and the next grade price on the planet first step', () => {
    const { tally } = dockedWithMoney('1000')
    expect(toCanonical(planetOne(tally).arrivalWallet)).toBe('1e+3')
    expect(toCanonical(planetOne(tally).arrivalGradePrice)).toBe('2.4e+2')
    expect(planetOne(tally).collapses).toBe(0)
  })
})
