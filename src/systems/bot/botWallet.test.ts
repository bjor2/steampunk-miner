import { describe, expect, it } from 'vitest'
import { createAuthorityState } from '../authority/authorityState'
import { dockSiteOfPlanet } from '../authority/planetOfState'
import { serviceReserveOf } from '../authority/serviceReserve'
import { rescueFee } from '../economy/planetCharges'
import { add, cmp, fromCanonical, sub, type Money } from '../money'
import { buyUpgrades } from './botShopping'
import { createBotSession, type BotSession } from './botSession'
import { canPay, canPayForBrass, walletOf } from './botWallet'
import { paramsOfSession } from './botWorld'
import { newMineLayout } from './mineLayout'

const WORLD_SEED = 83921
/** Tens of millions: about a P9 wallet before T9's two-death stall (#137). */
const P9_WALLET = '30000000'
const ONE_MILLI = fromCanonical('0.001')

function botAtUpgradeBayOn(planetIndex: number, money: string): BotSession {
  const start = createAuthorityState({ planetIndex: 1, planetSeed: WORLD_SEED, playerIds: ['p1'] })
  const session = createBotSession(start, 'p1')
  session.submit({ type: 'debug.setPlanet', payload: { planetIndex } })
  session.submit({ type: 'debug.setMoney', payload: { amount: money } })
  session.submit({ type: 'debug.teleportToDock', payload: { bay: 'upgrade' } })
  return session
}

/** #180's service reserve plus the fee a tow would take from this wallet. */
function brassReserveFor(session: BotSession, wallet: Money): Money {
  const state = session.state()
  return add(serviceReserveOf(state, session.playerId), rescueFee(state.planet.index, wallet))
}

function shopForTheCore(session: BotSession): void {
  const site = dockSiteOfPlanet(session.state().planet)!
  buyUpgrades(session, {
    layout: newMineLayout(paramsOfSession(session.state()), site),
    isCoreTheGoal: true,
    gunPolicy: 'never',
    hasMetBlastTile: false,
    chainPolicy: 'click',
  })
}

describe('bot: the brass reserve (#198)', () => {
  it('pays for a track step on planet 9 only when it leaves the service reserve and one rescue fee', () => {
    const session = botAtUpgradeBayOn(9, P9_WALLET)
    const wallet = walletOf(session)
    const mostItMaySpend = sub(wallet, brassReserveFor(session, wallet))
    expect(canPayForBrass(session, mostItMaySpend)).toBe(true)
    expect(canPayForBrass(session, add(mostItMaySpend, ONE_MILLI))).toBe(false)
    expect(canPay(session, add(mostItMaySpend, ONE_MILLI))).toBe(true)
  })

  it('leaves planet 7 spending down to the next service, as before', () => {
    const session = botAtUpgradeBayOn(7, P9_WALLET)
    const wallet = walletOf(session)
    const pastTheReserve = add(sub(wallet, brassReserveFor(session, wallet)), ONE_MILLI)
    expect(canPayForBrass(session, pastTheReserve)).toBe(canPay(session, pastTheReserve))
    expect(canPayForBrass(session, pastTheReserve)).toBe(true)
  })

  it('ends a planet 9 shopping visit with a rescue fee and the service reserve still in the wallet', () => {
    const session = botAtUpgradeBayOn(9, P9_WALLET)
    shopForTheCore(session)
    const left = walletOf(session)
    expect(cmp(left, sub(fromCanonical(P9_WALLET), fromCanonical('1')))).toBeLessThan(0)
    expect(cmp(left, brassReserveFor(session, left))).toBeGreaterThanOrEqual(0)
  })
})
