import { describe, expect, it } from 'vitest'
import { TICKS_PER_SECOND } from '../constants/physics'
import { createAuthorityState, type AuthorityState } from '../systems/authority/authorityState'
import type { DomainEvent, DomainEventBody } from '../systems/authority/domainEvent'
import { travelFee } from '../systems/economy/planetCharges'
import {
  fromCanonical,
  fromFiniteNumber,
  fromSafeInteger,
  mul,
  sub,
  toFixedText,
  ZERO_MONEY,
} from '../systems/money'
import { FACING } from '../systems/vehicle/vehiclePose'
import { freshPlanetParamsFor } from '../systems/world/planetParams'
import { surfaceRowOfColumn } from '../systems/world/tileGrid'
import { emptyDrillPaceTally, type PlanetDrillPace } from './drillPace'
import {
  emptyRadiusRebaselineTally,
  tallyRadiusRebaselineStep,
  type PlanetRadiusPace,
  type RadiusRebaselineTally,
} from './radiusRebaseline'
import {
  gatedRadiusRebaselineProblemsOf,
  printedRadiusRebaselineLinesOf,
} from './radiusRebaselineBars'
import {
  equilibriumRateStepOf,
  pStarOfRateStep,
  type RadiusRebaselineRun,
} from './radiusRebaselineMedians'

const PLAYER = 'p1'
const SEED = 83921
const TICKS_PER_MINUTE = 60 * TICKS_PER_SECOND

describe('radius re-baseline tally (ticket 644)', () => {
  it('counts the sales from arrival to the core, and the wallet the core leaves', () => {
    const tally = emptyRadiusRebaselineTally()
    step(tally, stateAt(0, 1, 0, '0'), [])
    step(tally, stateAt(100, 1, 0, '40'), [sold('40')])
    step(tally, stateAt(200, 1, 0, '90'), [sold('50'), { type: 'CoreCompleted', durationTicks: 0 }])
    step(tally, stateAt(300, 1, 0, '120'), [sold('30')])

    const pace = tally.planets.get(1)
    expect(pace?.coreTick).toBe(200)
    expect(toFixedText(pace?.salesToCore ?? ZERO_MONEY, 0)).toBe('90')
    expect(toFixedText(pace?.walletAtCore ?? ZERO_MONEY, 0)).toBe('90')
  })

  it('times a trip from leaving the surface to the next dock, and its climb from the deepest point', () => {
    const tally = emptyRadiusRebaselineTally()
    step(tally, stateAt(0, 1, 0, '0'), [])
    step(tally, stateAt(100, 1, 5, '0'), [])
    step(tally, stateAt(400, 1, 30, '0'), [])
    step(tally, stateAt(700, 1, 30, '0'), [])
    step(tally, stateAt(800, 1, 12, '0'), [])
    step(tally, stateAt(1000, 1, 0, '0'), [docked()])

    expect(tally.planets.get(1)).toMatchObject({ tripTicks: 900, climbTicks: 300 })
    expect(tally.trip).toBeNull()
  })

  it('keeps each hop with its charge and the wallet it was paid from', () => {
    const tally = emptyRadiusRebaselineTally()
    step(tally, stateAt(0, 1, 0, '500'), [])
    step(tally, stateAt(50, 2, 0, '440'), [travelled(1, '60')])

    expect(tally.hops).toHaveLength(1)
    expect(tally.hops[0].fromPlanet).toBe(1)
    expect(toFixedText(tally.hops[0].walletBefore, 0)).toBe('500')
    expect(tally.planets.get(2)?.arrivalTick).toBe(50)
  })
})

describe('radius re-baseline bars (ticket 644)', () => {
  it('reads the VS closed form: the #551 equilibrium step is about x3.6 and gives back p* 1.51', () => {
    const step = equilibriumRateStepOf(5, 1.51)
    expect(step).toBeGreaterThan(3.55)
    expect(step).toBeLessThan(3.7)
    expect(pStarOfRateStep(5, step)).toBeCloseTo(1.51, 3)
  })

  it('passes three seeds that hold every bar on P1 to P10', () => {
    expect(gatedRadiusRebaselineProblemsOf(threeSeeds(onBars))).toEqual([])
  })

  it('fails a planet outside 22 to 30 minutes, planet 1 included', () => {
    const problems = gatedRadiusRebaselineProblemsOf(
      threeSeeds((planet) => ({ ...onBars(planet), minutes: planet === 1 ? 40 : 26 })),
    )
    expect(problems).toContain('planet 1 takes 40.0 min, outside 22 to 30')
  })

  it('fails a money per minute step over 5% off the #551 equilibrium, and p* off 1.51 over the steps', () => {
    const problems = gatedRadiusRebaselineProblemsOf(
      threeSeeds((planet) => ({ ...onBars(planet), rateStepShare: planet === 4 ? 1.2 : 1 })),
    )
    expect(problems.some((line) => line.startsWith('planet 4 money per minute'))).toBe(true)
    expect(problems.some((line) => line.startsWith('planet 5 money per minute'))).toBe(false)
    expect(problems.some((line) => line.startsWith('p* '))).toBe(false)

    const allHigh = threeSeeds((planet) => ({ ...onBars(planet), rateStepShare: 1.15 }))
    expect(gatedRadiusRebaselineProblemsOf(allHigh).some((line) => line.startsWith('p* '))).toBe(
      true,
    )
  })

  it('fails a planet whose ore cells grow less than x1.15 on the one before', () => {
    const problems = gatedRadiusRebaselineProblemsOf(
      threeSeeds((planet) => ({ ...onBars(planet), oreGrowth: planet === 6 ? 1.1 : 1.2 })),
    )
    expect(problems).toContain('planet 6 holds x1.100 the ore cells before it, under x1.15')
  })

  it('fails a climb from the deepest point longer than a quarter of the trip from P2', () => {
    const problems = gatedRadiusRebaselineProblemsOf(
      threeSeeds((planet) => ({ ...onBars(planet), climbShare: 0.3 })),
    )
    expect(problems).not.toContain(expect.stringMatching(/^planet 1 climbs/))
    expect(problems).toContain(
      'planet 2 climbs from the deepest point for 3000 bp of a trip, bar 2500',
    )
  })

  it('fails a P1->P5 hop over 15% of the core wallet, or clamped on most seeds', () => {
    const runs = threeSeeds((planet) => ({
      ...onBars(planet),
      coreWalletFees: planet === 2 ? 5 : 10,
    }))
    clampHop(runs[0], 3)
    clampHop(runs[1], 3)
    const problems = gatedRadiusRebaselineProblemsOf(runs)

    expect(problems).toContain('hop P2->P3 charges 2000 bp of the core wallet, bar 1500')
    expect(problems.some((line) => line.startsWith('hop P3->P4 clamped on 2 of 3 seeds'))).toBe(
      true,
    )
  })

  it('fails a seed left behind after a core, or short of five open planets', () => {
    const runs = threeSeeds(onBars)
    runs[2].radius.hops = runs[2].radius.hops.filter((hop) => hop.fromPlanet !== 2)
    const stalled = runs[1].radius.planets.get(4) as PlanetRadiusPace
    stalled.coreTick = null
    const problems = gatedRadiusRebaselineProblemsOf(runs)

    expect(problems).toContain(
      `seed ${SEED + 2} never left planet 2 after its core (travel blocked)`,
    )
    expect(problems).toContain(
      `seed ${SEED + 1} never completed planet 4's core: fewer than 5 planets open`,
    )
  })

  it('prints each planet row with its radius and measured minutes', () => {
    const lines = printedRadiusRebaselineLinesOf(threeSeeds(onBars))
    expect(lines).toContain('planet 5 row: radius 582, measured 26.0 min')
  })
})

function step(tally: RadiusRebaselineTally, state: AuthorityState, bodies: DomainEventBody[]) {
  const events = bodies.map((body) => ({ tick: state.tick, ...body }) as DomainEvent)
  tallyRadiusRebaselineStep(tally, state, PLAYER, events)
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

function sold(value: string): DomainEventBody {
  return { type: 'ResourceSold', items: [], value, mode: 'all', coinsShown: 0 }
}

function docked(): DomainEventBody {
  return { type: 'DockEntered', bay: 'sell', cargoUnits: 0, energy: 0, hull: '0' }
}

function travelled(fromPlanet: number, cost: string): DomainEventBody {
  return { type: 'TravelStarted', fromPlanet, toPlanet: fromPlanet + 1, cost, coreSpent: 0 }
}

/** What one synthetic planet does: everything a bar reads, on the bars unless a test moves it. */
interface PlanetPlay {
  minutes: number
  /** The money per minute step over the #551 equilibrium step. */
  rateStepShare: number
  oreGrowth: number
  climbShare: number
  /** The wallet at the core of the planet, in travel fees of its hop. */
  coreWalletFees: number
}

function onBars(_planet: number): PlanetPlay {
  return { minutes: 26, rateStepShare: 1, oreGrowth: 1.2, climbShare: 0.2, coreWalletFees: 10 }
}

function threeSeeds(play: (planet: number) => PlanetPlay): RadiusRebaselineRun[] {
  return [SEED, SEED + 1, SEED + 2].map((worldSeed) => runOf(worldSeed, play))
}

function runOf(worldSeed: number, play: (planet: number) => PlanetPlay): RadiusRebaselineRun {
  const drill = emptyDrillPaceTally()
  const radius = emptyRadiusRebaselineTally()
  const oreCellsByPlanet = new Map<number, number>()
  let arrivalTick = 0
  let rate = 100
  let oreCells = 1000
  for (let planet = 1; planet <= 10; planet++) {
    const plan = play(planet)
    if (planet > 1) rate *= equilibriumRateStepOf(planet, 1.51) * plan.rateStepShare
    if (planet > 1) oreCells = Math.round(oreCells * plan.oreGrowth)
    const coreTick = arrivalTick + plan.minutes * TICKS_PER_MINUTE
    drill.planets.set(planet, drillPaceOf(planet, arrivalTick, coreTick))
    radius.planets.set(planet, radiusPaceOf(planet, arrivalTick, coreTick, rate, plan))
    radius.hops.push({ fromPlanet: planet, cost: travelFee(planet), walletBefore: ZERO_MONEY })
    oreCellsByPlanet.set(planet, oreCells)
    arrivalTick = coreTick + TICKS_PER_MINUTE
  }
  return { worldSeed, drill, radius, oreCellsByPlanet }
}

function drillPaceOf(planet: number, arrivalTick: number, coreTick: number): PlanetDrillPace {
  const heldTicks = coreTick - arrivalTick
  return {
    planet,
    arrivalTick,
    coreTick,
    drillPurchases: 3,
    feltTicks: 6 * heldTicks,
    heldTicks,
    coreFelt: 6,
    longestGapTicks: 0,
    majors: 5,
    drillTipMajors: 5,
    catchUpPurchases: 0,
    trackSpend: {},
    tankEmpties: 0,
  }
}

function radiusPaceOf(
  planet: number,
  arrivalTick: number,
  coreTick: number,
  rate: number,
  plan: PlanetPlay,
): PlanetRadiusPace {
  const tripTicks = 10000
  return {
    planet,
    arrivalTick,
    coreTick,
    salesToCore: fromFiniteNumber(rate * plan.minutes),
    walletAtCore: mul(travelFee(planet), fromSafeInteger(plan.coreWalletFees)),
    tripTicks,
    climbTicks: Math.round(tripTicks * plan.climbShare),
  }
}

/** The run's hop from `fromPlanet` paid a coin under the row fee: the clamp bound. */
function clampHop(run: RadiusRebaselineRun, fromPlanet: number): void {
  const hop = run.radius.hops.find((made) => made.fromPlanet === fromPlanet)
  if (hop !== undefined) hop.cost = sub(hop.cost, fromCanonical('0.001'))
}
