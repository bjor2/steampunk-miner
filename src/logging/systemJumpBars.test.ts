import { describe, expect, it } from 'vitest'
import {
  jumpFuelUnitsOf,
  systemJumpFeeOf,
  systemJumpFuelUnitsOf,
} from '../systems/economy/jumpFuel'
import { onCurveSteps } from '../systems/economy/vehicleStats'
import {
  ceilMilli,
  div,
  fromSafeInteger,
  mul,
  toSafeInteger,
  ZERO_MONEY,
  type Money,
} from '../systems/money'
import { emptyDrillPaceTally, feltCellsPerSecond, feltCellsPerSecondInSystem } from './drillPace'
import { emptyRadiusRebaselineTally } from './radiusRebaseline'
import { emptyStarMapTravelTally } from './starMapTravel'
import type { StarMapTravelRun } from './starMapTravelBars'
import { STAR_MAP_TRAVEL_BARS } from './starMapTravelBars'
import {
  gatedSystemJumpProblemsOf,
  printedSystemJumpLinesOf,
  SYSTEM_JUMP_BARS,
} from './systemJumpBars'

const SEED = 83921
const HELD_TICKS = 100
const LEVELS = onCurveSteps(5)
const ARRIVAL = feltCellsPerSecondInSystem(LEVELS, 6, 2n)
const BASIS_POINTS = 10000
const JUMP_FEE = systemJumpFeeOf(5, 6)

/** The wallet at planet 5's core that the jump's fee is `shareBp` basis points of. */
function walletForShareBp(shareBp: number): Money {
  return ceilMilli(div(mul(JUMP_FEE, fromSafeInteger(BASIS_POINTS)), fromSafeInteger(shareBp)))
}

/** The run with planet 5's core left at `wallet`. */
function withCoreWallet(run: StarMapTravelRun, wallet: Money): StarMapTravelRun {
  run.radius.planets.set(5, {
    planet: 5,
    arrivalTick: 0,
    coreTick: 1,
    salesToCore: ZERO_MONEY,
    walletAtCore: wallet,
    tripTicks: 0,
    climbTicks: 0,
  })
  return run
}

function threeSeedsAtShareBp(shareBp: number): StarMapTravelRun[] {
  return threeSeeds(ARRIVAL).map((run) => withCoreWallet(run, walletForShareBp(shareBp)))
}

/** One seed whose planet 5 averaged `planetFiveFelt` cells/s and that jumped with `LEVELS`. */
function runOf(worldSeed: number, planetFiveFelt: number, hasJumped = true): StarMapTravelRun {
  const drill = emptyDrillPaceTally()
  drill.planets.set(5, {
    planet: 5,
    arrivalTick: 0,
    coreTick: 1,
    drillPurchases: 3,
    feltTicks: planetFiveFelt * HELD_TICKS,
    heldTicks: HELD_TICKS,
    coreFelt: planetFiveFelt,
    longestGapTicks: 0,
    majors: 5,
    drillTipMajors: 5,
    catchUpPurchases: 0,
    trackSpend: {},
    tankEmpties: 0,
  })
  return {
    worldSeed,
    drill,
    radius: emptyRadiusRebaselineTally(),
    starMap: emptyStarMapTravelTally(),
    systemJumpLevels: hasJumped ? { ...LEVELS } : null,
  }
}

function threeSeeds(planetFiveFelt: number, hasJumped = true): StarMapTravelRun[] {
  return [SEED, SEED + 1, SEED + 2].map((seed) => runOf(seed, planetFiveFelt, hasJumped))
}

describe('system jump bar (ticket 759)', () => {
  it('cuts system 2 slower than system 1 at the same campaign index and levels', () => {
    expect(ARRIVAL).toBeGreaterThan(0)
    expect(ARRIVAL).toBeLessThan(feltCellsPerSecond(LEVELS, 6))
  })

  it('passes an arrival at 0.9x planet 5 or more', () => {
    expect(gatedSystemJumpProblemsOf(threeSeeds(ARRIVAL / 0.95))).toEqual([])
  })

  it('fails an arrival under 0.9x planet 5, naming the ratio', () => {
    expect(gatedSystemJumpProblemsOf(threeSeeds(ARRIVAL / 0.8))).toEqual([
      "system jump P5->S2P1 felt 0.80x planet 5's average, under 0.9",
    ])
  })

  it('fails a run that never jumped out of system 1', () => {
    expect(gatedSystemJumpProblemsOf(threeSeeds(ARRIVAL, false))).toEqual([
      "the bot never jumped out of system 1's planet 5",
    ])
  })

  it('prints the arrival felt speed and its ratio', () => {
    expect(printedSystemJumpLinesOf(threeSeeds(ARRIVAL))).toEqual([
      `system jump P5->S2P1: felt ${ARRIVAL.toFixed(2)} cells/s on arrival, 1.00x planet 5's average`,
    ])
  })
})

describe('system jump fee bar, J (ticket 776)', () => {
  it("passes a jump fee of 12-15% of the wallet at planet 5's core", () => {
    expect(gatedSystemJumpProblemsOf(threeSeedsAtShareBp(1400))).toEqual([])
  })

  it('fails a jump fee over 15% or under 12% of the core wallet, naming the share', () => {
    expect(gatedSystemJumpProblemsOf(threeSeedsAtShareBp(1600))).toEqual([
      "system jump P5->S2P1 fee is 1599 bp of planet 5's core wallet, outside 1200-1500",
    ])
    expect(gatedSystemJumpProblemsOf(threeSeedsAtShareBp(1100))).toEqual([
      "system jump P5->S2P1 fee is 1099 bp of planet 5's core wallet, outside 1200-1500",
    ])
  })

  it('prints the jump fee as a share of the core wallet', () => {
    expect(printedSystemJumpLinesOf(threeSeedsAtShareBp(1400)).at(-1)).toBe(
      'system jump P5->S2P1: fee 1399 bp of the core wallet (J)',
    )
  })

  it("lands on paper at 14%: J's whole units make the jump 1.4 hops, at the hop bar's middle", () => {
    const { min, max } = STAR_MAP_TRAVEL_BARS.feeShareBp
    const hopMiddleBp = fromSafeInteger((min + max) / 2)
    const jumpOverHop = div(systemJumpFuelUnitsOf(5, 6), jumpFuelUnitsOf(5, 6))
    const paperShareBp = toSafeInteger(mul(jumpOverHop, hopMiddleBp))
    expect(paperShareBp).toBe(1400)
    expect(paperShareBp).toBeGreaterThanOrEqual(SYSTEM_JUMP_BARS.feeShareBp.min)
    expect(paperShareBp).toBeLessThanOrEqual(SYSTEM_JUMP_BARS.feeShareBp.max)
  })
})
