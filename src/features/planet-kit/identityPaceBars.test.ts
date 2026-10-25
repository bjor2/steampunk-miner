import { describe, expect, it } from 'vitest'
import { TICKS_PER_SECOND } from '../../constants/physics'
import { emptyDrillPaceTally, type PlanetDrillPace } from '../../logging/drillPace'
import { emptyRadiusRebaselineTally } from '../../logging/radiusRebaseline'
import { fromFiniteNumber, fromSafeInteger, ZERO_MONEY } from '../../systems/money'
import { equilibriumOf, identityPaceProblemsOf } from './identityPaceBars'
import { identityPaceLinesOf, identityTraceRowsOf } from './identityPaceLines'
import { IDENTITY_PLANETS, localItemIdOf } from './identityPaceRows'
import type { IdentityPaceRun, MerchantHand } from './identityPaceRuns'
import { emptyIdentityTrace, type PlanetIdentity } from './identityTrace'
import { paceBaselineMarkdownOf } from './paceBaselineDoc'

// The PK7 identity gate's bars (ticket 826), judged on the seeds' medians: the skip-all-merchants
// run passes every pacing row, merchants on stays within 5% of it, makes each planet's own
// decision, keeps its kit spend off the curve's 6% / 12% and mines the premium ore on its first
// trip after the jump in.

const TICKS_PER_MINUTE = 60 * TICKS_PER_SECOND
const SEEDS = [83921, 31415, 27182]

/** How one run went, planet by planet; each array is indexed by planet - 1. */
interface RunShape {
  minutes: readonly number[]
  felt?: number
  drillTip?: number
  /** Item ids bought on each planet; empty arrays for merchants off. */
  decisions: readonly (readonly string[])[]
  /** What one kit buy costs, out of `spent` a planet. */
  kitPrice?: number
  spent?: number
  firstTripPremium?: bigint
}

/** Money per minute stepping exactly at the #551 equilibrium from 1000 on planet 1. */
function ratesAtEquilibrium(): number[] {
  return IDENTITY_PLANETS.reduce<number[]>(
    (rates, planet) => [...rates, planet === 1 ? 1000 : rates[planet - 2] * equilibriumOf(planet)],
    [],
  )
}

function runOf(worldSeed: number, hand: MerchantHand, shape: RunShape): IdentityPaceRun {
  const run: IdentityPaceRun = {
    worldSeed,
    hand,
    drill: emptyDrillPaceTally(),
    radius: emptyRadiusRebaselineTally(),
    trace: emptyIdentityTrace(),
  }
  const rates = ratesAtEquilibrium()
  let tick = 0
  IDENTITY_PLANETS.forEach((planet, at) => {
    const ticks = Math.round(shape.minutes[at] * TICKS_PER_MINUTE)
    run.drill.planets.set(planet, drillPaceOf(planet, tick, ticks, shape))
    run.radius.planets.set(planet, {
      planet,
      arrivalTick: tick,
      coreTick: tick + ticks,
      salesToCore: fromFiniteNumber(rates[at] * shape.minutes[at]),
      walletAtCore: null,
      tripTicks: 0,
      climbTicks: 0,
    })
    run.trace.planets.set(planet, identityOf(planet, shape.decisions[at], shape))
    tick += ticks
  })
  return run
}

function drillPaceOf(planet: number, arrivalTick: number, ticks: number, shape: RunShape) {
  const felt = shape.felt ?? 10
  const pace: PlanetDrillPace = {
    planet,
    arrivalTick,
    coreTick: arrivalTick + ticks,
    drillPurchases: 0,
    feltTicks: felt * ticks,
    heldTicks: ticks,
    coreFelt: felt,
    longestGapTicks: 0,
    majors: 0,
    drillTipMajors: shape.drillTip ?? 5,
    catchUpPurchases: 0,
    trackSpend: {},
    tankEmpties: 0,
  }
  return pace
}

function identityOf(planet: number, decision: readonly string[], shape: RunShape): PlanetIdentity {
  const kitPrice = fromSafeInteger(shape.kitPrice ?? 10)
  return {
    planet,
    kitBuys: new Map(decision.map((itemId) => [itemId, { count: 1, spent: kitPrice }])),
    cratesDropped: 0,
    flasksUncorked: 0,
    actingTicks: new Map(),
    spent: fromSafeInteger(shape.spent ?? 1000),
    fuelSpent: ZERO_MONEY,
    sales: fromSafeInteger(1000),
    premiumIncome: fromSafeInteger(20),
    firstTripPremiumUnits: shape.firstTripPremium ?? 4n,
    hasHaulDocked: true,
  }
}

const LOCAL_DECISIONS = IDENTITY_PLANETS.map((planet) => [localItemIdOf(planet) as string])
const NO_DECISIONS = IDENTITY_PLANETS.map(() => [])
const ON_PACE = [25, 25, 25, 25, 25]

function offRuns(shape: Partial<RunShape> = {}): IdentityPaceRun[] {
  return SEEDS.map((seed) =>
    runOf(seed, 'off', { minutes: ON_PACE, decisions: NO_DECISIONS, ...shape }),
  )
}

function onRuns(shape: Partial<RunShape> = {}): IdentityPaceRun[] {
  return SEEDS.map((seed) =>
    runOf(seed, 'on', { minutes: ON_PACE, decisions: LOCAL_DECISIONS, ...shape }),
  )
}

describe('planet kit: the PK7 per-planet identity bars (ticket 826)', () => {
  it('names a different local decision on each planet: the crate, then each hazard kit', () => {
    expect(IDENTITY_PLANETS.map(localItemIdOf)).toEqual([
      'cache_crate',
      'scree_plough',
      'damp_flask',
      'shard_tongs',
      'vent_vane',
    ])
  })

  it('holds every bar when both halves run on pace and merchants on decides on each planet', () => {
    expect(identityPaceProblemsOf(offRuns(), onRuns())).toEqual([])
  })

  it('fails the skip-all-merchants row when the bare bot buys at a merchant or runs slow', () => {
    const off = SEEDS.map((seed, at) =>
      runOf(seed, 'off', {
        minutes: [25, 25, 32, 25, 25],
        decisions: at === 0 ? LOCAL_DECISIONS : NO_DECISIONS,
      }),
    )
    const problems = identityPaceProblemsOf(off, onRuns({ minutes: [25, 25, 32, 25, 25] }))
    expect(problems).toContain('skip-all-merchants: planet 3 takes 32.0 min, outside 22 to 30')
    expect(problems).toContain('skip-all-merchants: seed 83921 bought cache_crate on planet 1')
  })

  it('fails a planet merchants on runs more than 5% slower than skip-all', () => {
    expect(identityPaceProblemsOf(offRuns(), onRuns({ minutes: [25, 27, 25, 25, 25] }))).toEqual([
      "merchants on: planet 2 minutes 27.00, outside 5% of off's 25.00",
    ])
  })

  it('fails a seed that never bought its planet’s own item', () => {
    const on = onRuns()
    on[1].trace.planets.get(4)?.kitBuys.clear()
    expect(identityPaceProblemsOf(offRuns(), on)).toEqual([
      'merchants on: seed 31415 never bought shard_tongs on planet 4',
    ])
  })

  it('fails a kit item over 6% of the money spent, and the kit over 12%', () => {
    const problems = identityPaceProblemsOf(offRuns(), onRuns({ kitPrice: 350 }))
    expect(problems).toContain('merchants on: cache_crate is 700 bp of the money spent, bar 600')
    expect(problems).toContain(
      'merchants on: the kit items are 3500 bp of the money spent, bar 1200',
    )
  })

  it('fails a planet whose premium ore the first trip after the jump in never mined', () => {
    expect(identityPaceProblemsOf(offRuns(), onRuns({ firstTripPremium: 0n }))).toEqual(
      [2, 3, 4, 5].map(
        (planet) =>
          `merchants on: planet ${planet}'s premium ore not mined on the first trip (median 0)`,
      ),
    )
  })

  it('prints a trace row per planet with time, decision, off-curve and merchant income shares', () => {
    const lines = identityPaceLinesOf(offRuns(), onRuns())
    expect(lines).toHaveLength(2 + 5 + 3)
    expect(lines[3]).toBe(
      '| 2 | 25.0 | 25.0 | 10.00 | 10.00 | 5 | scree_plough 3/3 | 1.0% | 2.0% | 0.0% |',
    )
    expect(lines[7]).toBe(
      'seed 83921 merchants on: P1 cache_crate; P2 scree_plough; P3 damp_flask; P4 shard_tongs; P5 vent_vane',
    )
  })

  it('logs one trace row per seed, hand and planet', () => {
    const rows = identityTraceRowsOf([...offRuns(), ...onRuns()])
    expect(rows).toHaveLength(2 * 3 * 5)
    expect(rows.find((row) => row.hand === 'on' && row.planet === 3)).toMatchObject({
      seed: 83921,
      minutes: 25,
      decision: ['damp_flask'],
      offCurveShareBp: 100,
      merchantIncomeShareBp: 200,
      flaskGasSales: '0.0',
    })
  })

  it('writes the pace baseline with per-seed and median minutes for P1 to P5 both ways', () => {
    const doc = paceBaselineMarkdownOf(offRuns(), onRuns(), '2026-10-25')
    expect(doc).toContain('| **median** | **25.0** | **25.0** | **25.0** | **25.0** | **25.0** |')
    expect(doc).toContain('| 31415 | 25.0 | 25.0 | 25.0 | 25.0 | 25.0 |')
    expect(doc).toContain('Measured on 2026-10-25.')
  })
})
