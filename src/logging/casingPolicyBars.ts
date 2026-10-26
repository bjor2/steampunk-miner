/**
 * The bot rows of ticket 829 (GD lock on casing grades by depth, the VS's pacing rows) a bot lane
 * judges on the median of the pacing seeds (#84), planets 1 to `lastPlanet`:
 *
 *   on curve   the bot buys four grades a planet on time and never bursts
 *   one short  a run one grade short of each band loses at most 5% of each planet's time
 *   skip       a run that buys no casing earns less money per minute (re-drill counted, since its
 *              bursts refill what it dug and it digs them again)
 *
 * A miss is a balance finding: if skipping pays, the burst's time cost rises, never hardness or a
 * bar (the VS, the GD).
 */
import { div, fromSafeInteger, ZERO_MONEY, type Money } from '../systems/money'
import { ECONOMY } from '../systems/economy/economy'
import { ratioOf } from './radiusRebaselineMedians'

export const CASING_POLICY_BARS = {
  lastPlanet: 3,
  oneShortPlanetTimeBpMax: 10500,
} as const

const BASIS_POINTS = 10000
/** The ladder's grades a planet past the first (ticket 829, `casing.gradesPerPlanet`). */
const GRADES_A_PLANET = ECONOMY.casing.gradesPerPlanet

/** One seed's run under one casing policy. */
export interface CasingPolicyRun {
  worldSeed: number
  /** The tick each planet's core was completed, by planet; a planet not completed is absent. */
  coreTicks: ReadonlyMap<number, number>
  /** What its sales paid, and over how many ticks of play. */
  earned: Money
  ticks: number
  bursts: number
  /** The casing grades it bought, by planet. */
  gradesBought: ReadonlyMap<number, number>
}

export interface CasingPolicyRuns {
  onCurve: readonly CasingPolicyRun[]
  oneShort: readonly CasingPolicyRun[]
  skip: readonly CasingPolicyRun[]
}

/** Every bar the runs miss; empty when they all hold. */
export function casingPolicyProblemsOf(runs: CasingPolicyRuns): string[] {
  return [
    ...onCurveProblems(runs.onCurve),
    ...oneShortProblems(runs.onCurve, runs.oneShort),
    ...skipProblems(runs.onCurve, runs.skip),
  ]
}

/** Each planet's time, the ticks from the core before (or the start) to its own. */
export function planetTicksOf(run: CasingPolicyRun, planet: number): number | null {
  const core = run.coreTicks.get(planet)
  if (core === undefined) return null
  return core - (planet === 1 ? 0 : (run.coreTicks.get(planet - 1) ?? 0))
}

/** Money per tick of play; 0 for a run that played no tick. */
export function earnedPerTickOf(run: CasingPolicyRun): Money {
  return run.ticks === 0 ? ZERO_MONEY : div(run.earned, fromSafeInteger(run.ticks))
}

function onCurveProblems(onCurve: readonly CasingPolicyRun[]): string[] {
  const bursts = medianOf(onCurve.map((run) => run.bursts))
  const grades = planetsToJudge().flatMap((planet) => {
    const bought = medianOf(onCurve.map((run) => run.gradesBought.get(planet) ?? 0))
    return planet === 1 || bought === GRADES_A_PLANET ? [] : [`P${planet}: bought ${bought} grades`]
  })
  return [...(bursts === 0 ? [] : [`the on-curve bot burst ${bursts} times`]), ...grades]
}

function oneShortProblems(
  onCurve: readonly CasingPolicyRun[],
  oneShort: readonly CasingPolicyRun[],
): string[] {
  return planetsToJudge().flatMap((planet) => {
    const base = medianOf(onCurve.map((run) => planetTicksOf(run, planet)))
    const short = medianOf(oneShort.map((run) => planetTicksOf(run, planet)))
    if (base === null || short === null) return [`P${planet}: a run did not reach the core`]
    const bp = Math.ceil((short * BASIS_POINTS) / base)
    if (bp <= CASING_POLICY_BARS.oneShortPlanetTimeBpMax) return []
    return [`P${planet}: one grade short took ${(bp / 100).toFixed(2)}% of the on-curve time`]
  })
}

function skipProblems(
  onCurve: readonly CasingPolicyRun[],
  skip: readonly CasingPolicyRun[],
): string[] {
  const base = medianOf(onCurve.map((run) => ratioOf(earnedPerTickOf(run), ONE)))
  const skipped = medianOf(skip.map((run) => ratioOf(earnedPerTickOf(run), ONE)))
  if (base === null || skipped === null || skipped < base) return []
  return ['skipping casing earned as much per minute as casing on the curve']
}

function planetsToJudge(): number[] {
  return Array.from({ length: CASING_POLICY_BARS.lastPlanet }, (_, index) => index + 1)
}

/** The middle value of the known ones; null when none is known. */
function medianOf(values: readonly (number | null)[]): number | null {
  const known = values.filter((value): value is number => value !== null).sort((a, b) => a - b)
  return known.length === 0 ? null : known[Math.floor((known.length - 1) / 2)]
}

const ONE = fromSafeInteger(1)
