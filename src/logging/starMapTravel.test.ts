import { describe, expect, it } from 'vitest'
import { createAuthorityState, type AuthorityState } from '../systems/authority/authorityState'
import type { DomainEvent, DomainEventBody } from '../systems/authority/domainEvent'
import { jumpFeeOf } from '../systems/economy/jumpFuel'
import { onCurveLevels } from '../systems/economy/vehicleStats'
import {
  add,
  div,
  fromCanonical,
  fromSafeInteger,
  mul,
  sub,
  toFixedText,
  ZERO_MONEY,
  type Money,
} from '../systems/money'
import { emptyDrillPaceTally, type PlanetDrillPace } from './drillPace'
import { emptyRadiusRebaselineTally } from './radiusRebaseline'
import { emptyStarMapTravelTally, tallyStarMapTravelStep } from './starMapTravel'
import {
  gatedStarMapTravelProblemsOf,
  printedStarMapTravelLinesOf,
  type BacktrackRun,
  type StarMapTravelRun,
} from './starMapTravelBars'

const PLAYER = 'p1'
const SEED = 83921
const PLANETS = [1, 2, 3, 4, 5]

function stateOn(planet: number): AuthorityState {
  return createAuthorityState({ planetIndex: planet, planetSeed: SEED, playerIds: [PLAYER] })
}

function step(tally: ReturnType<typeof emptyStarMapTravelTally>, bodies: DomainEventBody[]) {
  const events = bodies.map((body) => ({ tick: 0, ...body }) as DomainEvent)
  tallyStarMapTravelStep(tally, stateOn(1), PLAYER, events)
}

const docked = (bay: 'sell' | 'upgrade', cargoUnits: number): DomainEventBody => ({
  type: 'DockEntered',
  bay,
  cargoUnits: BigInt(cargoUnits),
  energy: 0,
  hull: '1e+2',
})
const sold = (value: string): DomainEventBody => ({
  type: 'ResourceSold',
  items: [],
  value,
  mode: 'all',
  coinsShown: 0,
})
const moneyChanged = (from: string, to: string): DomainEventBody => ({
  type: 'MoneyChanged',
  from,
  to,
})

const textsOf = (amounts: readonly Money[] | undefined) =>
  (amounts ?? []).map((amount) => toFixedText(amount, 0))

describe('star map travel tally (ticket 756)', () => {
  it('opens a run where a haul docks at the Sell bay, and adds the sales after it to that run', () => {
    const tally = emptyStarMapTravelTally()
    step(tally, [docked('sell', 10), sold('100'), sold('50')])
    step(tally, [docked('upgrade', 0)])
    step(tally, [docked('sell', 5), sold('30')])
    expect(textsOf(tally.runSales.get(1))).toEqual(['150', '30'])
  })

  it('counts every coin spent, the fuel and the tank apart, and never a debug command', () => {
    const tally = emptyStarMapTravelTally()
    step(tally, [
      { type: 'FuelBought', units: 5, cost: '100', tank: '5e+0' },
      moneyChanged('1000', '900'),
    ])
    step(tally, [
      { type: 'FuelTankBought', level: 2, cost: '250', capacity: '1.3e+1' },
      moneyChanged('900', '650'),
    ])
    step(tally, [moneyChanged('650', '700')])
    step(tally, [
      { type: 'DebugCommandApplied', command: 'debug.setMoney', args: {} },
      moneyChanged('700', '0'),
    ])
    const { total, fuel, tank } = tally.spend
    expect(textsOf([total, fuel, tank])).toEqual(['350', '100', '250'])
  })

  it('keeps the levels the vehicle left each planet with', () => {
    const tally = emptyStarMapTravelTally()
    step(tally, [{ type: 'TravelStarted', fromPlanet: 1, toPlanet: 2, cost: '0e+0', coreSpent: 0 }])
    expect(tally.departureLevels.get(1)).toEqual(stateOn(1).players[PLAYER].vehicle.levels)
  })
})

/** What a synthetic seed does; on every bar unless a test moves it. */
interface SeedPlay {
  /** The wallet at each core, in hop fees. */
  coreWalletFees: number
  /** Each run's sale, in tenths of the hop fee. */
  runFeeTenths: number
  /** Hops whose charge falls a coin under the list fee. */
  clampedHops: readonly number[]
  /** The money spent, in fuel spends (20 is 5%). */
  spendOfFuel: number
  /** The tank track's spend, in fuel spends. */
  tankOfFuel: number
}

const ON_BARS: SeedPlay = {
  coreWalletFees: 10,
  runFeeTenths: 20,
  clampedHops: [],
  spendOfFuel: 20,
  tankOfFuel: 0,
}

function times(amount: Money, count: number): Money {
  return mul(amount, fromSafeInteger(count))
}

function tenthsOf(amount: Money, tenths: number): Money {
  return div(times(amount, tenths), fromSafeInteger(10))
}

function runOf(worldSeed: number, play: SeedPlay): StarMapTravelRun {
  const drill = emptyDrillPaceTally()
  const radius = emptyRadiusRebaselineTally()
  const starMap = emptyStarMapTravelTally()
  let fuel = ZERO_MONEY
  for (const planet of PLANETS) {
    const fee = jumpFeeOf(planet, planet + 1)
    drill.planets.set(planet, drillPaceOf(planet))
    radius.planets.set(planet, {
      planet,
      arrivalTick: 0,
      coreTick: 1,
      salesToCore: times(fee, 20),
      walletAtCore: times(fee, play.coreWalletFees),
      tripTicks: 0,
      climbTicks: 0,
    })
    const isClamped = play.clampedHops.includes(planet)
    const cost = isClamped ? sub(fee, fromCanonical('0.001')) : fee
    radius.hops.push({ fromPlanet: planet, cost, listFee: fee, walletBefore: fee })
    starMap.runSales.set(
      planet,
      [1, 2, 3].map(() => tenthsOf(fee, play.runFeeTenths)),
    )
    starMap.departureLevels.set(planet, onCurveLevels(planet))
    fuel = add(fuel, cost)
  }
  starMap.spend = {
    total: times(fuel, play.spendOfFuel),
    fuel,
    tank: times(fuel, play.tankOfFuel),
  }
  return { worldSeed, drill, radius, starMap }
}

function drillPaceOf(planet: number): PlanetDrillPace {
  return {
    planet,
    arrivalTick: 0,
    coreTick: 1,
    drillPurchases: 3,
    feltTicks: 600,
    heldTicks: 100,
    coreFelt: 6,
    longestGapTicks: 0,
    majors: 5,
    drillTipMajors: 5,
    catchUpPurchases: 0,
    trackSpend: {},
    tankEmpties: 0,
  }
}

function threeSeeds(play: SeedPlay = ON_BARS): StarMapTravelRun[] {
  return [SEED, SEED + 1, SEED + 2].map((worldSeed) => runOf(worldSeed, play))
}

function backtracksOf(back: string, front: string): BacktrackRun[] {
  return [SEED, SEED + 1, SEED + 2].map((worldSeed) => ({
    worldSeed,
    planet: 2,
    backtrackRate: fromCanonical(back),
    frontierRate: fromCanonical(front),
  }))
}

const FRONTIER_PAYS = backtracksOf('50', '100')

describe('star map travel bars (ticket 756)', () => {
  it('passes seeds on every bar', () => {
    expect(gatedStarMapTravelProblemsOf(threeSeeds(), FRONTIER_PAYS)).toEqual([])
  })

  it('flags a hop fee outside 8-12% of the wallet at core harvest', () => {
    const problems = gatedStarMapTravelProblemsOf(
      threeSeeds({ ...ON_BARS, coreWalletFees: 20 }),
      FRONTIER_PAYS,
    )
    expect(problems).toContain('hop P1->P2 fee is 500 bp of the core wallet, outside 800-1200')
  })

  it('flags a hop that charges more than 15% of the wallet at core harvest', () => {
    const problems = gatedStarMapTravelProblemsOf(
      threeSeeds({ ...ON_BARS, coreWalletFees: 5 }),
      FRONTIER_PAYS,
    )
    expect(problems).toContain('hop P3->P4 charges 2000 bp of the core wallet, bar 1500')
  })

  it('flags a seed whose clamp binds on two of the P1->P5 hops, and lets one pass', () => {
    const runs = threeSeeds()
    runs[1] = runOf(SEED + 1, { ...ON_BARS, clampedHops: [2, 3] })
    runs[2] = runOf(SEED + 2, { ...ON_BARS, clampedHops: [4] })
    expect(gatedStarMapTravelProblemsOf(runs, FRONTIER_PAYS)).toEqual([
      `seed ${SEED + 1}: the #648 clamp bound on 2 of the P1->P5 hops, bar 1`,
    ])
  })

  it("flags a hop dearer than the planet's median run, and a first haul that cannot pay P1->P2", () => {
    const problems = gatedStarMapTravelProblemsOf(threeSeeds({ ...ON_BARS, runFeeTenths: 5 }), [])
    expect(problems).toContain("hop P1->P2 fee is 20000 bp of the planet's median run, bar 10000")
    expect(problems.some((line) => line.startsWith('the first P1 haul sells'))).toBe(true)
  })

  it('flags fuel outside 3-8% of the money spent and a tank track over 6%', () => {
    const problems = gatedStarMapTravelProblemsOf(
      threeSeeds({ ...ON_BARS, spendOfFuel: 10, tankOfFuel: 1 }),
      FRONTIER_PAYS,
    )
    expect(problems).toEqual([
      'fuel is 1000 bp of the money spent, outside 300-800',
      'the tank track is 1000 bp of the money spent, bar 600',
    ])
  })

  it('flags a planet gone back to that earns as much a minute as the frontier', () => {
    expect(gatedStarMapTravelProblemsOf(threeSeeds(), backtracksOf('100', '100'))).toEqual([
      "back on planet 2 earns 100.0 a minute, not under the frontier's 100.0 on planet 3",
    ])
  })

  it('prints the measured run beside the stood-in R, and the arrival felt speed of a skip', () => {
    const lines = printedStarMapTravelLinesOf(threeSeeds(), FRONTIER_PAYS)
    expect(lines).toContain('planet 1: median run sells 506, the fuel curve stands R in at 506')
    expect(lines.some((line) => line.startsWith('hop P1->P3: felt '))).toBe(true)
    expect(lines).toContain('back on planet 2: 50.0 a minute, frontier planet 3: 100.0')
  })
})
