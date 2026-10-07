import { describe, expect, it } from 'vitest'
import { stepPrice } from '../economy/upgradePrices'
import { stepOfMajor } from '../economy/upgradeSteps'
import { add, cmp, fromCanonical, mul, sub, toCanonical, ZERO_MONEY, type Money } from '../money'
import type { CommandIntent } from './authorityCommand'
import { nextCasingPrice } from './casingRules'
import { rackSlotPriceOf } from './charges/chargeShopRules'
import type { DomainEvent } from './domainEvent'
import { nextGunPriceOf } from './gunRules'
import { repairCostOf } from './platformServices'
import { createScriptedSession, type ScriptedSession } from './scriptedSession'
import { serviceReserveOf } from './serviceReserve'
import { nextUpgradePrice } from './workshopRules'

const HOLD = 7

const buyStep = (upgradeId: string, chain: number): CommandIntent => ({
  type: 'buyUpgrade',
  payload: { upgradeId, chain },
})
const buyGun = (chain: number): CommandIntent => ({ type: 'buyGun', payload: { chain } })
const buyRackSlot = (chain: number): CommandIntent => ({
  type: 'buyChargeRackSlot',
  payload: { chain },
})
const buyCasing = (chain: number): CommandIntent => ({ type: 'buyCasingGrade', payload: { chain } })

/** Docked at the Upgrade bay of `planetIndex`, the wallet set to `money`. */
function upgradeBayOn(planetIndex: number, money: string): ScriptedSession {
  const session = createScriptedSession()
  session.submit(0, { type: 'debug.setPlanet', payload: { planetIndex } })
  session.submit(0, { type: 'debug.setMoney', payload: { amount: money } })
  session.submit(0, { type: 'debug.teleportToDock', payload: { bay: 'upgrade' } })
  return session
}

/** A dented hull, so the service reserve is the repair of the damage. */
function dentHull(session: ScriptedSession): Money {
  session.submit(0, { type: 'debug.setHull', payload: { hull: '10' } })
  return repairCostOf(session.state(), 'p1')
}

const walletOf = (session: ScriptedSession) => session.state().players.p1.wallet
const setMoney = (session: ScriptedSession, amount: Money) =>
  session.submit(0, { type: 'debug.setMoney', payload: { amount: toCanonical(amount) } })
const rejectionOf = (events: readonly DomainEvent[]) =>
  events.find((event) => event.type === 'CommandRejected')

/** The drill power steps from `from` bought in one chain, the wallet holding exactly their sum. */
function buyChainWithExactWallet(from: number, steps: number, chain: number) {
  const session = upgradeBayOn(3, toCanonical(sumOfStepPrices(from, steps)))
  session.submit(0, {
    type: 'debug.setUpgrade',
    payload: { upgradeId: 'drill_power', level: from },
  })
  const events = [...Array(steps).keys()].flatMap((step) =>
    session.submit(1 + step, buyStep('drill_power', chain)),
  )
  const costs = events.flatMap((event) => (event.type === 'UpgradePurchased' ? [event.cost] : []))
  return { costs, step: session.vehicle().levels.drill_power, wallet: walletOf(session) }
}

function sumOfStepPrices(from: number, steps: number): Money {
  let total = ZERO_MONEY
  for (let step = from; step < from + steps; step += 1) {
    total = add(total, stepPrice('drill_power', step, 3))
  }
  return total
}

/**
 * The wallet left after paying the sum is zero to money's 40 significant digits: exact while prices
 * stay small, within 1e-38 of the sum past 1e37 (the TD's restated acceptance 3 on #180).
 */
function isWithinPrecisionOfZero(left: Money, sum: Money): boolean {
  const tolerance = mul(sum, fromCanonical('1e-38'))
  return cmp(left, tolerance) <= 0 && cmp(left, sub(ZERO_MONEY, tolerance)) >= 0
}

describe('purchase chains: cost (#180 section 2, ticket 226)', () => {
  it.each([
    ['level 1', stepOfMajor(1)],
    ['a major boundary', stepOfMajor(4) - 4],
    ['level 607', stepOfMajor(607)],
    ['level 6007', stepOfMajor(6007)],
  ])('a 10-step chain from %s costs exactly its step prices, as 10 clicks do', (_name, from) => {
    const held = buyChainWithExactWallet(from, 10, HOLD)
    const prices = [...Array(10).keys()].map((k) =>
      toCanonical(stepPrice('drill_power', from + k, 3)),
    )
    expect(held.step).toBe(from + 10)
    expect(held.costs).toEqual(prices)
    expect(isWithinPrecisionOfZero(held.wallet, sumOfStepPrices(from, 10))).toBe(true)
    expect(buyChainWithExactWallet(from, 10, 0)).toEqual(held)
  })
})

describe('purchase chains: the service reserve (#180 amendment 2, ticket 226)', () => {
  it('refuses the held step that would dip under the reserve, and the steps before it stand', () => {
    const session = upgradeBayOn(3, '0')
    const reserve = dentHull(session)
    const from = session.vehicle().levels.drill_power
    const first = stepPrice('drill_power', from, 3)
    const second = stepPrice('drill_power', from + 1, 3)
    setMoney(session, add(add(reserve, first), sub(second, fromCanonical('1'))))
    session.submit(1, buyStep('drill_power', HOLD))
    const refused = rejectionOf(session.submit(2, buyStep('drill_power', HOLD)))
    expect(refused).toMatchObject({ reason: 'service_reserve', chain: HOLD })
    expect(session.vehicle().levels.drill_power).toBe(from + 1)
    expect(walletOf(session)).toEqual(sub(add(reserve, second), fromCanonical('1')))
  })

  it('lets a click spend into the reserve that refuses the same held step', () => {
    const session = upgradeBayOn(3, '0')
    const reserve = dentHull(session)
    setMoney(session, nextUpgradePrice(session.state(), 'p1', 'drill_power'))
    expect(serviceReserveOf(session.state(), 'p1')).toEqual(reserve)
    expect(rejectionOf(session.submit(1, buyStep('drill_power', HOLD)))?.reason).toBe(
      'service_reserve',
    )
    expect(rejectionOf(session.submit(2, buyStep('drill_power', 0)))).toBeUndefined()
    expect(walletOf(session)).toEqual(ZERO_MONEY)
  })

  it('refuses money_short first when the wallet cannot pay the step at all', () => {
    const session = upgradeBayOn(3, '1')
    dentHull(session)
    expect(rejectionOf(session.submit(1, buyStep('drill_power', HOLD)))?.reason).toBe('money_short')
  })

  it.each([
    ['guns', 5, buyGun, (s: ScriptedSession) => nextGunPriceOf(s.state(), 'p1')],
    ['rack', 7, buyRackSlot, (s: ScriptedSession) => rackSlotPriceOf(s.state(), 'p1')],
    ['casing', 3, buyCasing, (s: ScriptedSession) => nextCasingPrice(s.state(), 'p1')],
  ])('holds the %s row to the reserve too', (_row, planetIndex, buy, priceOf) => {
    const session = upgradeBayOn(planetIndex, '0')
    const reserve = dentHull(session)
    setMoney(session, add(reserve, sub(priceOf(session), fromCanonical('1'))))
    expect(rejectionOf(session.submit(1, buy(HOLD)))?.reason).toBe('service_reserve')
    expect(rejectionOf(session.submit(2, buy(0)))).toBeUndefined()
  })
})

describe('purchase chains: the unlock gate (TD lock on #177, ticket 226)', () => {
  it.each([
    ['guns', 3, buyGun],
    ['rack', 6, buyRackSlot],
  ])('refuses a held %s step before its feature unlocks', (_row, planetIndex, buy) => {
    const session = upgradeBayOn(planetIndex, '1e30')
    expect(rejectionOf(session.submit(1, buy(HOLD)))).toMatchObject({
      reason: 'feature_locked',
      chain: HOLD,
    })
  })
})

describe('purchase chains: the envelope (#180 TD acceptance 1, ticket 226)', () => {
  it.each([
    ['no chain', { upgradeId: 'drill_power' }],
    ['a negative chain', { upgradeId: 'drill_power', chain: -1 }],
    ['a fractional chain', { upgradeId: 'drill_power', chain: 1.5 }],
  ])('refuses a buyUpgrade with %s as invalid_payload', (_name, payload) => {
    const session = upgradeBayOn(3, '1e30')
    const intent = { type: 'buyUpgrade', payload } as unknown as CommandIntent
    expect(rejectionOf(session.submit(1, intent))?.reason).toBe('invalid_payload')
  })

  it('stamps a click with chain 0 and no reserve line', () => {
    const session = upgradeBayOn(3, '1e30')
    const [bought] = session.submit(1, buyStep('drill_power', 0))
    expect(bought).toMatchObject({ type: 'UpgradePurchased', chain: 0 })
    expect(bought).not.toHaveProperty('reserveLeft')
  })

  it('stamps a held step with its chain and what the wallet holds above the reserve after it', () => {
    const session = upgradeBayOn(3, '1e30')
    dentHull(session)
    const [bought] = session.submit(1, buyStep('drill_power', HOLD))
    const above = sub(walletOf(session), serviceReserveOf(session.state(), 'p1'))
    expect(bought).toMatchObject({ chain: HOLD, reserveLeft: toCanonical(above) })
  })

  it('names no chain on the refusal of a click', () => {
    const session = upgradeBayOn(3, '1')
    expect(rejectionOf(session.submit(1, buyStep('drill_power', 0)))).not.toHaveProperty('chain')
  })
})
