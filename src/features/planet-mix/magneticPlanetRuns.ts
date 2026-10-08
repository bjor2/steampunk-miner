/**
 * The runs behind `balance:magnetic-planet` (GD lock on spec #258 Q7, ticket 294): the pacing bot
 * arrives on a magnetic planet with the on-curve levels and a little money, then plays to the core
 * three ways on each pacing seed, all else equal: the class off at the same index, the class on with
 * a bare drill head, and the class on with the dielectric bit in `drill.head`. One loadout command
 * goes first in all three, so every run stamps the same `seq`s. Only specs use it.
 *
 * The bot's pilot sets its pose, so the field's tug (felt in the scene's motion step) never reaches
 * it; the runs measure the shock ticks and the hull the hazard costs, mended at the repair price.
 */
import { PACING_WORLD_SEEDS } from '../../constants/pacingSeeds'
import { TICKS_PER_SECOND } from '../../constants/physics'
import type { CommandIntent } from '../../systems/authority/authorityCommand'
import { createAuthorityState } from '../../systems/authority/authorityState'
import type { DomainEvent } from '../../systems/authority/domainEvent'
import { setVehicleLoadoutCommand } from '../../systems/authority/loadoutCommands'
import { playSlice, type SliceRun } from '../../systems/bot/playSlice'
import { UPGRADE_IDS } from '../../systems/economy/economyDefinition'
import { stepOfMajor } from '../../systems/economy/upgradeSteps'
import { onCurveLevel } from '../../systems/economy/vehicleStats'
import {
  add,
  div,
  floor,
  fromCanonical,
  fromSafeInteger,
  mul,
  toSafeInteger,
  ZERO_MONEY,
  type Money,
} from '../../systems/money'
import { setPlanetCommand, setPlanetSeedCommand } from '../../systems/startScenarioCommands'
import { setUpgradeCommand } from '../../systems/vehicle/vehicleCommands'
import { DIELECTRIC_BIT_ID } from '../drill-gear'
import { withMagneticClassOff } from './magneticClassOff'

/** Three Lodestone-act planets (#141): the act's first, the lode clamp's and its last. */
export const MAGNETIC_PLANETS = [25, 28, 32] as const
export const MAGNETIC_SEEDS = PACING_WORLD_SEEDS['bot-slice']

/** Ratios in basis points of the class-off run's, judged on the median of the seeds (#84). */
export const BASIS_POINTS = 10000
/** Without the bit: at most +10% planet time, and never faster than off. */
export const MAX_BARE_TIME_BP = 11000
export const MIN_BARE_TIME_BP = BASIS_POINTS
/** With the bit: at least 0.98x the class-off time (the #205 assert); it never beats baseline. */
export const MIN_BIT_TIME_BP = 9800
/** Income per minute on the magnetic run: the magnets' 15% cap, not raised there (#246). */
export const MAX_INCOME_BP = 11500
/** Band value within #141's +4% of the same planet with the class off. */
export const BAND_VALUE_TOLERANCE_BP = 400

/** Two hours on one planet: room for a slow core on any run. */
const BUDGET_TICKS = 2 * 60 * 60 * TICKS_PER_SECOND
const TICKS_PER_MINUTE = 60 * TICKS_PER_SECOND
const ARRIVAL_MONEY = '20000'

const BARE_HEAD = setVehicleLoadoutCommand({})
const BIT_HEAD = setVehicleLoadoutCommand({ 'drill.head': DIELECTRIC_BIT_ID })

export interface MagneticPlanetRuns {
  planet: number
  seed: number
  /** The same planet index with the magnetic class switched off: the baseline. */
  off: SliceRun
  bare: SliceRun
  withBit: SliceRun
}

/** The three runs on `planet` and `seed`. */
export function magneticPlanetRunsOn(planet: number, seed: number): MagneticPlanetRuns {
  return {
    planet,
    seed,
    off: withMagneticClassOff(() => coreRunOn(planet, seed, BARE_HEAD)),
    bare: coreRunOn(planet, seed, BARE_HEAD),
    withBit: coreRunOn(planet, seed, BIT_HEAD),
  }
}

/** Ticks from arrival to the planet's core; the whole budget when the core is never reached. */
export function coreTicksOf(run: SliceRun): number {
  return run.isFinished ? run.state.tick : BUDGET_TICKS
}

/** `run`'s core time over the baseline's, in basis points. */
export function timeRatioBp(run: SliceRun, baseline: SliceRun): number {
  return ratioBp(fromSafeInteger(coreTicksOf(run)), fromSafeInteger(coreTicksOf(baseline)))
}

/** `run`'s sale income per minute over the baseline's, in basis points. */
export function incomeRatioBp(run: SliceRun, baseline: SliceRun): number {
  return ratioBp(incomePerMinuteOf(run), incomePerMinuteOf(baseline))
}

/** `value` over `baseline` in whole basis points, rounded down. */
export function ratioBp(value: Money, baseline: Money): number {
  return toSafeInteger(floor(mul(div(value, baseline), fromSafeInteger(BASIS_POINTS))))
}

export function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]
}

/** One line per run set, as the Tester reads it in the log. */
export function describeRuns(runs: MagneticPlanetRuns): string {
  const minutes = (run: SliceRun) => (coreTicksOf(run) / TICKS_PER_MINUTE).toFixed(1)
  const { planet, seed, off, bare, withBit } = runs
  return `P${planet} seed ${seed}: off ${minutes(off)} min, on ${minutes(bare)} min (${timeRatioBp(bare, off)} bp, income ${incomeRatioBp(bare, off)} bp), with the bit ${minutes(withBit)} min (${timeRatioBp(withBit, off)} bp)`
}

/** On `planet` with the on-curve levels and a little money, as a bot arriving there. */
function arrivalOn(planet: number, worldSeed: number): CommandIntent[] {
  return [
    setPlanetCommand(planet),
    setPlanetSeedCommand(worldSeed),
    { type: 'debug.setMoney', payload: { amount: ARRIVAL_MONEY } },
    ...UPGRADE_IDS.map((id) => setUpgradeCommand(id, stepOfMajor(onCurveLevel(id, planet)))),
  ]
}

/** The bot from arrival on `planet` to its core, with `head` sent before the first trip. */
function coreRunOn(planet: number, worldSeed: number, head: CommandIntent): SliceRun {
  const start = createAuthorityState({ planetIndex: 1, planetSeed: worldSeed, playerIds: ['p1'] })
  return playSlice(start, {
    maxTicks: BUDGET_TICKS,
    lastPlanet: planet,
    startCommands: [...arrivalOn(planet, worldSeed), head],
  })
}

/** Money from every sale of the run over its minutes. */
function incomePerMinuteOf(run: SliceRun): Money {
  const minutes = div(fromSafeInteger(coreTicksOf(run)), fromSafeInteger(TICKS_PER_MINUTE))
  return div(saleIncomeOf(run.events), minutes)
}

function saleIncomeOf(events: readonly DomainEvent[]): Money {
  return events
    .map((event) => (event.type === 'ResourceSold' ? fromCanonical(event.value) : ZERO_MONEY))
    .reduce(add, ZERO_MONEY)
}
