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

function visit(income: string, stepsBought: number, drillCapacity = 0): SpreeVisit {
  return {
    planetIndex: 2,
    income: m(income),
    capacity: { ...NO_CAPACITY, drill_power: drillCapacity, hull: 99 },
    boughtTracks: stepsBought > 0 ? ['drill_power'] : [],
    stepsBought,
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
    }
    const other: DomainEvent = { ...sold, playerId: 'p2' }
    expect(toCanonical(measureSpree(session, [sold, sold, other]).income)).toBe('2.5e+2')
  })

  it('names the tracks bought at the visit and the steps bought', () => {
    const session = botOnPlanet3('400')
    const measure = measureSpree(session, [])
    const after = { ...measure.levelsBefore, hull: 3, boiler: 1 }
    expect(visitOf(measure, after)).toMatchObject({
      boughtTracks: ['boiler', 'hull'],
      stepsBought: 4,
    })
  })
})

describe('bot: the spree targets (#180 section 4)', () => {
  it('takes the median steps bought a visit', () => {
    const visits = [visit('10', 2), visit('20', 5), visit('30', 6), visit('40', 9)]
    expect(spreeTargetsOf(visits).medianStepsPerVisit).toBe(5)
  })

  it('judges the spree share on above-median trips and the tracks the bot bought', () => {
    const visits = [
      visit('10', 4, 30),
      visit('20', 5),
      visit('30', 6, 12),
      visit('40', 7, 3),
      visit('50', 0),
    ]
    const targets = spreeTargetsOf(visits)
    expect(targets).toMatchObject({ goodTrips: 2, goodTripsWithSpree: 0 })
    expect(spreePercentOf(targets)).toBe(0)
  })

  it('meets both targets with 4 to 8 steps a visit and a third of good trips spreeing', () => {
    const visits = [
      visit('10', 4),
      visit('20', 5),
      visit('30', 6),
      visit('40', 6, 10),
      visit('50', 7, 10),
      visit('60', 8),
      visit('70', 5),
    ]
    expect(spreePercentOf(spreeTargetsOf(visits))).toBe(33)
    expect(spreeTargetMisses(spreeTargetsOf(visits))).toEqual([])
  })

  it('lists each target missed', () => {
    expect(spreeTargetMisses(spreeTargetsOf([visit('10', 1), visit('20', 2)]))).toEqual([
      'median steps a visit 1, target 4 to 8',
      'above-median trips with a spree 0%, target 25 to 40%',
    ])
  })
})
