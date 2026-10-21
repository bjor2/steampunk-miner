/**
 * The R3 bars under the radius rule (ticket 644), judged on the median of the pacing seeds (#84):
 * the GD lock R3 on #302 (6306854642), its addendum (6306861669), the VS guards on #305
 * (6306854175) and the Campaign Scaling room's rows on #644 (21 Oct):
 *
 *   gated   planet minutes 22 to 30 on P1-P10 (P1 by the room's P1-P5 row), felt speed at least
 *           0.9x the planet before at every step (no #306 exception is named yet), drill + tip
 *           majors 3.5 to 7.0 on P2-P10, p* 1.51 +/- 0.03 over the P1->P10 steps, money per
 *           minute within 5% of the #551 equilibrium step on each planet, total ore cells at least
 *           x1.15 a planet, the climb from a trip's deepest point at most 25% of the trip on
 *           P2-P10, the travel fee at most 15% of the wallet at core harvest on each P1->P5 hop,
 *           every P1->P5 hop paid in full (the next planet affordable, the next on-curve drill or
 *           tip still affordable after it), no seed left behind after a core (travel never
 *           blocks), and every seed through P5's core (five planets open)
 *   printed the p* and rate of each step, total money per planet, drill + tip amber at 7, the
 *           measured minutes for the planet rows and the paceScale the miss asks to retune first
 *
 * A miss is a balance finding: that planet's paceScale first, then the shared k (150-200, one
 * value), then a named exception to the GD. Never ore prices, never #551.
 */
import { freshRadiusTilesOf } from '../systems/world/planetParams'
import { paceScale } from '../systems/economy/planetEconomy'
import { toCanonical, toFixedText } from '../systems/money'
import { planetMediansOf, type PlanetMedians } from './drillPaceBars'
import {
  equilibriumRateStepOf,
  hopMediansOf,
  planetRadiusMediansOf,
  pStarOfRateStep,
  ratioOf,
  type HopMedians,
  type PlanetRadiusMedians,
  type RadiusRebaselineRun,
} from './radiusRebaselineMedians'

export const RADIUS_REBASELINE_BARS = {
  lastPlanet: 10,
  planetMinutes: { min: 22, max: 30 },
  feltRatioToPreviousMin: 0.9,
  firstCadencePlanet: 2,
  drillTipMajorsPerPlanet: { min: 3.5, max: 7, amber: 7 },
  pStar: { target: 1.51, tolerance: 0.03 },
  moneyRateToEquilibrium: { min: 0.95, max: 1.05 },
  oreGrowthPerPlanetMin: 1.15,
  firstClimbPlanet: 2,
  climbShareBpMax: 2500,
  openingHopLastFrom: 4,
  feeShareBpMax: 1500,
  openPlanets: 5,
} as const

const PLANETS = Array.from({ length: RADIUS_REBASELINE_BARS.lastPlanet }, (_, at) => at + 1)
const OPENING_HOPS = Array.from(
  { length: RADIUS_REBASELINE_BARS.openingHopLastFrom },
  (_, at) => at + 1,
)

/** One planet's numbers: the drill pace medians beside the radius ones. */
interface PlanetRow {
  pace: PlanetMedians
  radius: PlanetRadiusMedians
}

function planetRowsOf(runs: readonly RadiusRebaselineRun[]): PlanetRow[] {
  const paces = planetMediansOf(runs.map(({ worldSeed, drill }) => ({ worldSeed, tally: drill })))
  const radii = planetRadiusMediansOf(runs, PLANETS)
  return PLANETS.map((planet, at) => ({ pace: paces[at], radius: radii[at] }))
}

/** The bars the lane gates, as problems; empty when they hold. */
export function gatedRadiusRebaselineProblemsOf(runs: readonly RadiusRebaselineRun[]): string[] {
  const rows = planetRowsOf(runs)
  const hops = hopMediansOf(runs, OPENING_HOPS)
  return [
    ...rows.flatMap(minutesProblems),
    ...rows.flatMap((row, at) => feltRatioProblems(row, rows[at - 1])),
    ...rows.flatMap(drillTipCadenceProblems),
    ...pStarProblems(rows),
    ...rows.flatMap((row, at) => moneyRateProblems(row, rows[at - 1])),
    ...rows.flatMap((row, at) => oreGrowthProblems(row, rows[at - 1])),
    ...rows.flatMap(climbShareProblems),
    ...hops.flatMap(feeShareProblems),
    ...hops.flatMap(unaffordableHopProblems),
    ...runs.flatMap(blockedTravelProblems),
    ...runs.flatMap(closedPlanetProblems),
  ]
}

function minutesProblems({ pace }: PlanetRow): string[] {
  const { min, max } = RADIUS_REBASELINE_BARS.planetMinutes
  if (pace.minutes === null) return [`planet ${pace.planet} core never reached on the median seed`]
  if (pace.minutes >= min && pace.minutes <= max) return []
  return [`planet ${pace.planet} takes ${pace.minutes.toFixed(1)} min, outside 22 to 30`]
}

function feltRatioProblems({ pace }: PlanetRow, before: PlanetRow | undefined): string[] {
  const ratio = stepOf(pace.averageFelt, before?.pace.averageFelt ?? null)
  if (ratio === null || ratio >= RADIUS_REBASELINE_BARS.feltRatioToPreviousMin) return []
  return [`planet ${pace.planet} felt speed ${ratio.toFixed(2)}x the planet before, under 0.9`]
}

function drillTipCadenceProblems({ pace }: PlanetRow): string[] {
  const { min, max } = RADIUS_REBASELINE_BARS.drillTipMajorsPerPlanet
  const majors = pace.drillTipMajors
  if (!isCadencePlanet(pace.planet) || majors === null) return []
  if (majors >= min && majors <= max) return []
  return [`planet ${pace.planet} lands ${majors} drill + tip majors, outside 3.5 to 7.0`]
}

function isCadencePlanet(planet: number): boolean {
  return planet >= RADIUS_REBASELINE_BARS.firstCadencePlanet
}

function pStarProblems(rows: readonly PlanetRow[]): string[] {
  const pStar = pStarOverStepsOf(rows)
  const { target, tolerance } = RADIUS_REBASELINE_BARS.pStar
  if (pStar === null) return ['p* has no step: no two planets in a row reached their cores']
  if (Math.abs(pStar - target) <= tolerance) return []
  return [`p* ${pStar.toFixed(3)} over the planet steps, outside 1.51 +/- 0.03`]
}

/**
 * p* over every measured step: the VS's closed form on the steps' mean log rate and hardness
 * steps, which is p* on the geometric mean step.
 */
function pStarOverStepsOf(rows: readonly PlanetRow[]): number | null {
  const steps = rows.flatMap((row, at) => rateStepOf(row, rows[at - 1]))
  if (steps.length === 0) return null
  const meanLogPStar =
    steps.reduce((sum, { planet, step }) => sum + Math.log(pStarOfRateStep(planet, step)), 0) /
    steps.length
  return Math.exp(meanLogPStar)
}

function rateStepOf(row: PlanetRow, before: PlanetRow | undefined) {
  const after = row.radius.moneyPerMinute
  const from = before?.radius.moneyPerMinute ?? null
  if (after === null || from === null) return []
  return [{ planet: row.radius.planet, step: ratioOf(after, from) }]
}

function moneyRateProblems(row: PlanetRow, before: PlanetRow | undefined): string[] {
  const [measured] = rateStepOf(row, before)
  if (measured === undefined) return []
  const { min, max } = RADIUS_REBASELINE_BARS.moneyRateToEquilibrium
  const equilibrium = equilibriumRateStepOf(measured.planet, RADIUS_REBASELINE_BARS.pStar.target)
  const share = measured.step / equilibrium
  if (share >= min && share <= max) return []
  return [
    `planet ${measured.planet} money per minute x${measured.step.toFixed(2)} the planet before, ` +
      `${share.toFixed(2)}x the #551 equilibrium x${equilibrium.toFixed(2)}, outside +/- 5%`,
  ]
}

function oreGrowthProblems({ radius }: PlanetRow, before: PlanetRow | undefined): string[] {
  const growth = stepOf(radius.oreCells, before?.radius.oreCells ?? null)
  if (growth === null || growth >= RADIUS_REBASELINE_BARS.oreGrowthPerPlanetMin) return []
  return [
    `planet ${radius.planet} holds x${growth.toFixed(3)} the ore cells before it, under x1.15`,
  ]
}

function climbShareProblems({ radius }: PlanetRow): string[] {
  const share = radius.climbShareBp
  if (radius.planet < RADIUS_REBASELINE_BARS.firstClimbPlanet || share === null) return []
  if (share <= RADIUS_REBASELINE_BARS.climbShareBpMax) return []
  return [
    `planet ${radius.planet} climbs from the deepest point for ${share} bp of a trip, bar 2500`,
  ]
}

function feeShareProblems({ fromPlanet, feeShareBp }: HopMedians): string[] {
  if (feeShareBp === null || feeShareBp <= RADIUS_REBASELINE_BARS.feeShareBpMax) return []
  return [
    `hop P${fromPlanet}->P${fromPlanet + 1} charges ${feeShareBp} bp of the core wallet, bar 1500`,
  ]
}

/** On the median seed: more than half the seeds that made the hop could not pay it in full. */
function unaffordableHopProblems(hop: HopMedians): string[] {
  if (hop.clampedSeeds * 2 <= hop.seedsHopped) return []
  return [
    `hop P${hop.fromPlanet}->P${hop.fromPlanet + 1} clamped on ${hop.clampedSeeds} of ` +
      `${hop.seedsHopped} seeds: the full fee and the next on-curve drill or tip were not both affordable`,
  ]
}

function blockedTravelProblems({ worldSeed, radius }: RadiusRebaselineRun): string[] {
  return OPENING_HOPS.filter((planet) => radius.planets.get(planet)?.coreTick != null)
    .filter((planet) => !radius.hops.some((hop) => hop.fromPlanet === planet))
    .map(
      (planet) => `seed ${worldSeed} never left planet ${planet} after its core (travel blocked)`,
    )
}

function closedPlanetProblems({ worldSeed, radius }: RadiusRebaselineRun): string[] {
  const open = RADIUS_REBASELINE_BARS.openPlanets
  const firstShut = PLANETS.slice(0, open).find((p) => radius.planets.get(p)?.coreTick == null)
  if (firstShut === undefined) return []
  return [
    `seed ${worldSeed} never completed planet ${firstShut}'s core: fewer than ${open} planets open`,
  ]
}

function stepOf(after: number | null, before: number | null): number | null {
  if (after === null || before === null || before === 0) return null
  return after / before
}

/** The bars the lane prints and never gates, each as a line. */
export function printedRadiusRebaselineLinesOf(runs: readonly RadiusRebaselineRun[]): string[] {
  const rows = planetRowsOf(runs)
  return [
    ...rows.flatMap((row, at) => rateStepLines(row, rows[at - 1])),
    ...rows.map(totalMoneyLine),
    ...rows.flatMap(drillTipAmberLines),
    ...rows.map(measuredMinutesLine),
    ...rows.flatMap(retuneLines),
  ]
}

function rateStepLines(row: PlanetRow, before: PlanetRow | undefined): string[] {
  const [measured] = rateStepOf(row, before)
  if (measured === undefined) return []
  const pStar = pStarOfRateStep(measured.planet, measured.step)
  return [
    `planet ${measured.planet}: money per minute x${measured.step.toFixed(2)}, p* ${pStar.toFixed(3)}`,
  ]
}

function totalMoneyLine({ radius }: PlanetRow): string {
  const total = radius.salesToCore === null ? 'never' : toFixedText(radius.salesToCore, 0)
  return `planet ${radius.planet}: ${total} sold to the core, ${radius.oreCells ?? '-'} ore cells`
}

function drillTipAmberLines({ pace }: PlanetRow): string[] {
  const isAmber = pace.drillTipMajors === RADIUS_REBASELINE_BARS.drillTipMajorsPerPlanet.amber
  return isCadencePlanet(pace.planet) && isAmber
    ? [`planet ${pace.planet} amber: ${pace.drillTipMajors} drill + tip majors`]
    : []
}

/** The planet row's `measuredMinutes` to record (R1 on #302: each row records its minutes). */
function measuredMinutesLine({ pace }: PlanetRow): string {
  const minutes = pace.minutes === null ? 'never' : pace.minutes.toFixed(1)
  return `planet ${pace.planet} row: radius ${freshRadiusTilesOf(pace.planet)}, measured ${minutes} min`
}

/** A planet outside 22-30 min names its first lever, its own paceScale (GD addendum). */
function retuneLines({ pace }: PlanetRow): string[] {
  const { min, max } = RADIUS_REBASELINE_BARS.planetMinutes
  if (pace.minutes !== null && pace.minutes >= min && pace.minutes <= max) return []
  return [
    `planet ${pace.planet} misses 22-30 min at paceScale ${toCanonical(paceScale(pace.planet))}: ` +
      'retune its paceScale first, then the shared k (150-200), then a named exception to the GD',
  ]
}
