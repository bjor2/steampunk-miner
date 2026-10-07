import { describe, expect, it } from 'vitest'
import { createAuthorityState } from '../authority/authorityState'
import type { DomainEvent } from '../authority/domainEvent'
import { serviceReserveOf } from '../authority/serviceReserve'
import { UPGRADE_IDS, type UpgradeId } from '../economy/economyDefinition'
import { stepPrice } from '../economy/upgradePrices'
import { add, cmp, fromCanonical, sub, toCanonical, ZERO_MONEY } from '../money'
import { createBotSession } from './botSession'
import { measureSpree, SPREE_CAP, visitOf, type SpreeVisit } from './spreeCapacity'
import { spreePercentOf, spreeTargetMisses, spreeTargetsOf } from './spreeTargets'

const m = fromCanonical
const NO_CAPACITY = Object.fromEntries(UPGRADE_IDS.map((id) => [id, 0])) as Record<
  UpgradeId,
  number
>

const NO_STEPS = NO_CAPACITY

/** A visit that bought `steps` on each track named, in order. */
function visit(
  income: string,
  steps: Partial<Record<UpgradeId, number>>,
  drillCapacity = 0,
): SpreeVisit {
  return {
    planetIndex: 2,
    income: m(income),
    capacity: { ...NO_CAPACITY, drill_power: drillCapacity, hull: 99 },
    stepsBought: { ...NO_STEPS, ...steps },
  }
}

function botOnPlanet3(money: string) {
  const start = createAuthorityState({ planetIndex: 1, planetSeed: 83921, playerIds: ['p1'] })
  const session = createBotSession(start, 'p1')
  session.submit({ type: 'debug.setPlanet', payload: { planetIndex: 3 } })
  session.submit({ type: 'debug.setMoney', payload: { amount: money } })
  session.submit({ type: 'debug.setHull', payload: { hull: '50' } })
  return session
}

describe('bot: the spree measure (#180 section 4)', () => {
  it('counts the steps in a row that the wallet above the service reserve pays for', () => {
    const session = botOnPlanet3('400')
    const budget = sub(m('400'), serviceReserveOf(session.state(), 'p1'))
    const { capacity } = measureSpree(session, [])
    for (const track of UPGRADE_IDS) {
      const prices = Array.from({ length: capacity[track] + 1 }, (_, at) => stepPrice(track, at, 3))
      const paid = prices.slice(0, capacity[track]).reduce(add, ZERO_MONEY)
      expect(cmp(paid, budget)).toBeLessThan(1)
      expect(cmp(add(paid, prices[capacity[track]]), budget)).toBe(1)
    }
  })

  it('stops counting at the cap of ten majors', () => {
    expect(measureSpree(botOnPlanet3('1e30'), []).capacity.hull).toBe(SPREE_CAP)
  })

  it("adds up the trip's sales and collected batches of this player as its income", () => {
    const session = botOnPlanet3('400')
    const stamp = { playerId: 'p1', tick: 5, seq: 1 }
    const sold: DomainEvent = {
      ...stamp,
      type: 'ResourceSold',
      items: [],
      value: '1.25e+2',
      mode: 'all',
      coinsShown: 3,
    }
    const other: DomainEvent = { ...sold, playerId: 'p2' }
    expect(toCanonical(measureSpree(session, [sold, sold, other]).income)).toBe('2.5e+2')
  })

  it('counts the steps bought on each track at the visit', () => {
    const session = botOnPlanet3('400')
    const measure = measureSpree(session, [])
    const after = { ...measure.levelsBefore, hull: 3, boiler: 1 }
    expect(visitOf(measure, after).stepsBought).toEqual({ ...NO_STEPS, hull: 3, boiler: 1 })
  })
})

describe('bot: the spree targets (#180 section 4, GD lock on #181)', () => {
  it('takes the median steps per bought track over the visits that bought', () => {
    const visits = [
      visit('10', { drill_power: 4 }),
      visit('20', { drill_power: 9, hull: 3 }),
      visit('30', {}),
      visit('40', { cargo_hold: 10 }),
    ]
    expect(spreeTargetsOf(visits).medianStepsPerBoughtTrack).toBe(6)
  })

  it('keeps the median steps a whole visit as information', () => {
    const visits = [visit('10', { hull: 2 }), visit('20', { hull: 2, boiler: 3 }), visit('30', {})]
    expect(spreeTargetsOf(visits).medianStepsPerVisit).toBe(2)
  })

  it('judges the spree share on the steps above-median trips bought on one track', () => {
    const visits = [
      visit('10', { drill_power: 12 }),
      visit('20', { drill_power: 5 }),
      visit('30', { drill_power: 5, hull: 5 }, 40),
      visit('40', { cargo_hold: 10 }),
      visit('50', {}),
    ]
    const targets = spreeTargetsOf(visits)
    expect(targets).toMatchObject({ goodTrips: 2, goodTripsWithSpree: 1 })
    expect(spreePercentOf(targets)).toBe(50)
  })

  it('counts the above-median trips that could have chained a spree, as information', () => {
    const visits = [visit('10', {}), visit('20', { drill_power: 2 }, 10), visit('30', {}, 9)]
    expect(spreeTargetsOf(visits).goodTripsWithSpreeCapacity).toBe(0)
    expect(spreeTargetsOf([...visits, visit('40', { drill_power: 2 }, 10)])).toMatchObject({
      goodTrips: 2,
      goodTripsWithSpreeCapacity: 1,
    })
  })

  it('meets both targets with 6 to 12 steps per bought track and a third of good trips spreeing', () => {
    const visits = [
      visit('10', { drill_power: 6 }),
      visit('20', { drill_power: 7 }),
      visit('30', { hull: 8 }),
      visit('40', { hull: 10 }),
      visit('50', { drill_power: 6, boiler: 6 }),
      visit('60', { cargo_hold: 11 }),
      visit('70', { engine: 4, hull: 4 }),
    ]
    expect(spreePercentOf(spreeTargetsOf(visits))).toBe(33)
    expect(spreeTargetMisses(spreeTargetsOf(visits))).toEqual([])
  })

  it('lists each target missed', () => {
    const visits = [visit('10', { hull: 1 }), visit('20', { hull: 2, boiler: 2 })]
    expect(spreeTargetMisses(spreeTargetsOf(visits))).toEqual([
      'median steps per bought track 1, target 6 to 12',
      'above-median trips that bought a spree 0%, target 25 to 45%',
    ])
  })
})
