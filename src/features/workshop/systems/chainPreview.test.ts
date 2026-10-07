import { describe, expect, it } from 'vitest'
import { createScriptedSession, dockInBay } from '../../../systems/authority/scriptedSession'
import { serviceReserveOf } from '../../../systems/authority/serviceReserve'
import { stepPrice } from '../../../systems/economy/upgradePrices'
import type { UpgradeId } from '../../../systems/economy/economyDefinition'
import {
  add,
  cmp,
  fromCanonical,
  sub,
  toCanonical,
  ZERO_MONEY,
  type Money,
} from '../../../systems/money'
import { chainPreviewOf } from './chainPreview'

type Session = ReturnType<typeof createScriptedSession>

/** What the first `count` steps of a track cost on planet 1, from step 0. */
function firstStepsCost(upgradeId: UpgradeId, count: number): Money {
  return Array.from({ length: count }, (_, step) => stepPrice(upgradeId, step, 1)).reduce(
    add,
    ZERO_MONEY,
  )
}

/** Docked at the Upgrade bay holding exactly `wallet`, with the hull down to `hull`. */
function atUpgradeBayWith(wallet: Money, hull: string | null = null): Session {
  const session = createScriptedSession()
  if (hull !== null) session.submit(1, { type: 'debug.setHull', payload: { hull } })
  dockInBay(session, 2, 'upgrade')
  session.submit(3, { type: 'debug.setMoney', payload: { amount: toCanonical(wallet) } })
  return session
}

describe('workshop chain preview', () => {
  it('counts the steps the wallet pays in a row and the majors they cross', () => {
    const session = atUpgradeBayWith(firstStepsCost('drill_power', 12))

    expect(chainPreviewOf(session.state(), 'p1', 'drill_power')).toMatchObject({
      steps: 12,
      majors: 1,
      spent: firstStepsCost('drill_power', 12),
      stoppedBy: 'money_short',
    })
  })

  it('stops a held chain where the next step would dip under the service reserve', () => {
    const probe = atUpgradeBayWith(ZERO_MONEY, '40')
    const reserve = serviceReserveOf(probe.state(), 'p1')
    const thirteenth = stepPrice('drill_power', 12, 1)
    const wallet = add(add(firstStepsCost('drill_power', 12), reserve), thirteenth)
    const session = atUpgradeBayWith(sub(wallet, fromCanonical('1')), '40')

    expect(cmp(reserve, ZERO_MONEY)).toBe(1)
    expect(chainPreviewOf(session.state(), 'p1', 'drill_power')).toMatchObject({
      steps: 12,
      reserve,
      stoppedBy: 'service_reserve',
    })
  })

  it('recomputes the reserve after every step, as boiler steps raise the recharge', () => {
    const session = atUpgradeBayWith(firstStepsCost('boiler', 5))
    const preview = chainPreviewOf(session.state(), 'p1', 'boiler')

    expect(serviceReserveOf(session.state(), 'p1')).toEqual(ZERO_MONEY)
    expect(preview.stoppedBy).toBe('service_reserve')
    expect(preview.steps).toBeLessThan(5)
    expect(cmp(preview.reserve, ZERO_MONEY)).toBe(1)
  })

  it('stops at once with the refusal a click would get away from the bay', () => {
    const session = createScriptedSession()

    expect(chainPreviewOf(session.state(), 'p1', 'drill_power')).toMatchObject({
      steps: 0,
      stoppedBy: 'not_docked',
    })
  })

  it('walks no further than its limit on a deep wallet', () => {
    const session = atUpgradeBayWith(fromCanonical('1e30'))

    expect(chainPreviewOf(session.state(), 'p1', 'hull', 25)).toMatchObject({
      steps: 25,
      stoppedBy: 'preview_limit',
    })
  })

  it('changes nothing in the state it previews', () => {
    const session = atUpgradeBayWith(firstStepsCost('engine', 4))
    const before = session.state()
    chainPreviewOf(before, 'p1', 'engine')

    expect(session.state()).toBe(before)
    expect(before.players.p1.vehicle.levels.engine).toBe(0)
  })
})
