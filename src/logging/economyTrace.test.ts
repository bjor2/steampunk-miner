import { describe, expect, it } from 'vitest'
import { createAuthorityState, type AuthorityState } from '../systems/authority/authorityState'
import type { DomainEvent, DomainEventBody } from '../systems/authority/domainEvent'
import { UPGRADE_IDS } from '../systems/economy/economyDefinition'
import { stepPrice } from '../systems/economy/upgradePrices'
import { onCurveSteps, type UpgradeLevels } from '../systems/economy/vehicleStats'
import { cmp, fromCanonical, toCanonical, toFixedText, ZERO_MONEY } from '../systems/money'
import { FACING } from '../systems/vehicle/vehiclePose'
import { freshPlanetParamsFor } from '../systems/world/planetParams'
import { surfaceRowOfColumn } from '../systems/world/tileGrid'
import { emptyEconomyTrace, traceEconomyStep, type EconomyTrace } from './economyTrace'
import { askWaitTicks, nextUsefulUpgradeOf } from './economyTraceAsks'

const PLAYER = 'p1'
const SEED = 83921

describe('economy trace (ticket 907)', () => {
  it('records the money held and the next useful upgrade on the planet first played step', () => {
    const trace = emptyEconomyTrace()
    step(trace, stateAt(0, 1, 0, '999999'), [setUp()])
    step(trace, stateAt(10, 1, 0, '300'), [])

    const planet = planetOf(trace, 1)
    expect(planet.arrivalTick).toBe(10)
    expect(toFixedText(planet.arrivalWallet, 0)).toBe('300')
    expect(planet.asks).toHaveLength(1)
    expect(planet.asks[0].openTick).toBe(10)
  })

  it('sums every sale into the planet income', () => {
    const trace = emptyEconomyTrace()
    step(trace, stateAt(0, 1, 0, '0'), [sold('40')])
    step(trace, stateAt(100, 1, 0, '90'), [sold('50')])

    expect(toFixedText(planetOf(trace, 1).income, 0)).toBe('90')
  })

  it('gives a trip the deepest band it mined and the sales after the dock that ended it', () => {
    const trace = emptyEconomyTrace()
    step(trace, stateAt(0, 1, 0, '0'), [])
    step(trace, stateAt(100, 1, 3, '0'), [broke(3)])
    step(trace, stateAt(200, 1, deepDepthTiles(1), '0'), [broke(deepDepthTiles(1))])
    step(trace, stateAt(300, 1, 3, '0'), [])
    step(trace, stateAt(400, 1, 0, '0'), [docked()])
    step(trace, stateAt(410, 1, 0, '70'), [sold('70')])
    step(trace, stateAt(420, 1, 0, '75'), [sold('5')])

    const [trip] = planetOf(trace, 1).trips
    expect(trip.band).toBeGreaterThan(1)
    expect(toFixedText(trip.value, 0)).toBe('75')
    expect(trip.isRescued).toBe(false)
  })

  it('ends no trip at a bay hop that mined nothing, so its sales stay with the trip before', () => {
    const trace = emptyEconomyTrace()
    step(trace, stateAt(0, 1, 0, '0'), [])
    step(trace, stateAt(100, 1, 3, '0'), [broke(3)])
    step(trace, stateAt(200, 1, 1, '0'), [docked()])
    step(trace, stateAt(300, 1, 1, '0'), [docked()])
    step(trace, stateAt(310, 1, 1, '40'), [sold('40')])

    const { trips } = planetOf(trace, 1)
    expect(trips).toHaveLength(1)
    expect(toFixedText(trips[0].value, 0)).toBe('40')
  })

  it('ends a trip at its rescue with nothing sold, and the next sales count for no trip', () => {
    const trace = emptyEconomyTrace()
    step(trace, stateAt(0, 1, 0, '0'), [])
    step(trace, stateAt(100, 1, 3, '0'), [])
    step(trace, stateAt(200, 1, 0, '0'), [rescued('stranded')])
    step(trace, stateAt(210, 1, 0, '30'), [sold('30')])

    const planet = planetOf(trace, 1)
    expect(planet.trips).toEqual([{ band: 1, value: ZERO_MONEY, isRescued: true }])
    expect(toFixedText(planet.income, 0)).toBe('30')
  })

  it('tags each death by cause: hazard kind, collapse, fuel and hull', () => {
    const trace = emptyEconomyTrace()
    step(trace, stateAt(0, 1, 0, '0'), [])
    dieOnTrip(trace, 100, [destroyed('firedamp'), rescued('destroyed')])
    dieOnTrip(trace, 200, [destroyed('collapse'), rescued('destroyed')])
    dieOnTrip(trace, 300, [rescued('stranded')])
    dieOnTrip(trace, 400, [drained('steamvent'), rescued('stranded')])
    dieOnTrip(trace, 500, [destroyed('enemy'), rescued('destroyed')])

    expect(Object.fromEntries(planetOf(trace, 1).deaths)).toEqual({
      'hazard.firedamp': 1,
      collapse: 1,
      fuel: 1,
      'fuel.steamvent': 1,
      'hull.enemy': 1,
    })
  })

  it('counts each purchase by what it bought', () => {
    const trace = emptyEconomyTrace()
    step(trace, stateAt(0, 1, 0, '0'), [bought('drill_tip'), bought('drill_tip')])
    step(trace, stateAt(10, 1, 0, '0'), [casingBought(), bought('hull')])

    expect(Object.fromEntries(planetOf(trace, 1).upgrades)).toEqual({
      drill_tip: 2,
      hull: 1,
      casing: 1,
    })
  })

  it('covers an ask on the first step the wallet holds its price, and times the wait', () => {
    const trace = emptyEconomyTrace()
    const { price } = nextUsefulUpgradeOf(stateAt(0, 1, 0, '0'), PLAYER)
    step(trace, stateAt(0, 1, 0, '0'), [])
    step(trace, stateAt(500, 1, 0, toCanonical(price)), [sold(toCanonical(price))])
    step(trace, stateAt(900, 1, 0, toCanonical(price)), [])

    const [ask] = planetOf(trace, 1).asks
    expect(ask.coveredTick).toBe(500)
    expect(askWaitTicks(ask, 900)).toBe(500)
  })

  it('opens the next ask after a track buy and marks an uncovered one replaced', () => {
    const trace = emptyEconomyTrace()
    step(trace, stateAt(0, 1, 0, '0'), [])
    step(trace, stateAt(300, 1, 0, '0'), [bought('engine')])

    const [first, second] = planetOf(trace, 1).asks
    expect(first).toMatchObject({ coveredTick: null, replacedTick: 300 })
    expect(askWaitTicks(first, 1000)).toBe(300)
    expect(second.openTick).toBe(300)
  })

  it('starts each planet with its own arrival, asks and no trip under way', () => {
    const trace = emptyEconomyTrace()
    step(trace, stateAt(0, 1, 0, '0'), [])
    step(trace, stateAt(100, 1, 3, '0'), [])
    step(trace, stateAt(200, 2, 0, '120'), [])
    step(trace, stateAt(300, 2, 0, '120'), [docked()])

    expect(planetOf(trace, 1).lastTick).toBe(100)
    expect(planetOf(trace, 2)).toMatchObject({ arrivalTick: 200, trips: [] })
    expect(toFixedText(planetOf(trace, 2).arrivalWallet, 0)).toBe('120')
  })
})

describe('next useful upgrade (ticket 907)', () => {
  it('asks the cheapest step of a track short of the planet on-curve level', () => {
    const state = withLevels(stateAt(0, 2, 0, '0'), { ...onCurveSteps(2), hull: 0 })
    const ask = nextUsefulUpgradeOf(state, PLAYER)

    expect(ask.upgradeId).toBe('hull')
    expect(toCanonical(ask.price)).toBe(toCanonical(stepPrice('hull', 0, 2)))
  })

  it('asks the cheapest step of any track once every track holds its on-curve level', () => {
    const state = withLevels(stateAt(0, 2, 0, '0'), onCurveSteps(2))
    const ask = nextUsefulUpgradeOf(state, PLAYER)
    const prices = UPGRADE_IDS.map((track) => stepPrice(track, onCurveSteps(2)[track], 2))

    expect(prices.every((price) => cmp(price, ask.price) >= 0)).toBe(true)
    expect(toCanonical(ask.price)).toBe(
      toCanonical(stepPrice(ask.upgradeId, onCurveSteps(2)[ask.upgradeId], 2)),
    )
  })
})

function planetOf(trace: EconomyTrace, planet: number) {
  const known = trace.planets.get(planet)
  if (known === undefined) throw new Error(`planet ${planet} was never traced`)
  return known
}

function step(trace: EconomyTrace, state: AuthorityState, bodies: DomainEventBody[]) {
  const events = bodies.map((body) => ({ tick: state.tick, ...body }) as DomainEvent)
  traceEconomyStep(trace, state, PLAYER, events)
}

/** A trip below the surface that ends in `ending` at the surface. */
function dieOnTrip(trace: EconomyTrace, tick: number, ending: DomainEventBody[]) {
  step(trace, stateAt(tick, 1, 3, '0'), ending.slice(0, -1))
  step(trace, stateAt(tick + 50, 1, 0, '0'), ending.slice(-1))
}

/** A one-player session on `planet` at `tick`, its vehicle `depthTiles` below column 0's surface. */
function stateAt(tick: number, planet: number, depthTiles: number, wallet: string): AuthorityState {
  const start = createAuthorityState({ planetIndex: planet, planetSeed: SEED, playerIds: [PLAYER] })
  const player = start.players[PLAYER]
  const { radiusTiles } = freshPlanetParamsFor(SEED, planet)
  const row = surfaceRowOfColumn(0, radiusTiles) - depthTiles
  const pose = { x: 500, y: row * 1000 + 500, vx: 0, vy: 0, upx: 0, upy: 1, facing: FACING.down }
  return {
    ...start,
    tick,
    players: {
      [PLAYER]: { ...player, wallet: fromCanonical(wallet), vehicle: { ...player.vehicle, pose } },
    },
  }
}

/** Halfway from the surface to the core: past band 1 on any planet. */
function deepDepthTiles(planet: number): number {
  const { radiusTiles, coreRadiusTiles } = freshPlanetParamsFor(SEED, planet)
  return Math.floor((radiusTiles - coreRadiusTiles) / 2)
}

function withLevels(state: AuthorityState, levels: UpgradeLevels): AuthorityState {
  const player = state.players[PLAYER]
  return {
    ...state,
    players: { [PLAYER]: { ...player, vehicle: { ...player.vehicle, levels } } },
  }
}

function setUp(): DomainEventBody {
  return { type: 'DebugCommandApplied', command: 'debug.setMoney', args: {} }
}

function sold(value: string): DomainEventBody {
  return { type: 'ResourceSold', items: [], value, mode: 'all', coinsShown: 0 }
}

/** The cell `depthTiles` below column 0's surface on planet 1 broke. */
function broke(depthTiles: number): DomainEventBody {
  const { radiusTiles } = freshPlanetParamsFor(SEED, 1)
  const ty = surfaceRowOfColumn(0, radiusTiles) - depthTiles
  return { type: 'TileDestroyed', tx: 0, ty, kind: 'ground' }
}

function docked(): DomainEventBody {
  return { type: 'DockEntered', bay: 'sell', cargoUnits: 0n, energy: 0, hull: '0' }
}

function rescued(cause: 'stranded' | 'destroyed'): DomainEventBody {
  return { type: 'RescueTriggered', cause, fee: '0', cargoLostValue: '0' }
}

function destroyed(cause: string): DomainEventBody {
  return { type: 'VehicleDestroyed', cause, attacker: null }
}

function drained(kind: string): DomainEventBody {
  return { type: 'HazardDrained', kind, tx: 0, ty: 0, ticks: 180, quanta: 1 }
}

function bought(upgradeId: string): DomainEventBody {
  return {
    type: 'UpgradePurchased',
    chain: 0,
    upgradeId,
    kind: 'vertical',
    fromLevel: 0,
    toLevel: 1,
    fromMajor: 0,
    toMajor: 0,
    isMajor: false,
    cost: '1',
    costCurveId: 'test',
    totalLevel: 0,
    visualTier: 1,
    statsAfter: {},
  }
}

function casingBought(): DomainEventBody {
  return { type: 'CasingUpgraded', chain: 0, from: 1, to: 2, price: '240' }
}
