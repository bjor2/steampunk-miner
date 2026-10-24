/**
 * The pacing bars of solar system 2 (ticket 779, spec #774; the GD lock of 23 Oct 20:20 on Campaign
 * Scaling with its HS and VS input), judged on the median of the pacing seeds (#84) of a bot run
 * that plays system 1 to planet 5's core, jumps (ticket 759) and plays system 2 to its last core
 * (`systemTwoPace.lane.test.ts`). The run is the named re-baseline "solar system 2". The bars are
 * the R3 lock's (`radiusRebaselineBars.ts`) and the star map's fuel row (`starMapTravelBars.ts`),
 * read on the planets of system 2:
 *
 *   gated   each planet 22 to 30 min; felt speed at least 0.9x the planet before, system 1's
 *           planet 5 before system 2's first (the jump's step felt, after the fee); drill + tip
 *           majors 3.5 to 7.0 a planet; money per minute within 5% of the #551 equilibrium step,
 *           which keys on g (VS: no value step at the jump); fuel 3-8% of the money spent in the
 *           system; every seed jumps and reaches every core of the system
 *   printed per seed each planet's roster name, size class and surface start beside the radius
 *           and ground step the world was generated with, the money step and p*, drill + tip
 *           amber at 7, and for a planet outside 22-30 min the fix order
 *
 * A miss is a balance finding, fixed in the lock's order: the step (k_jump, k_s), then the planet's
 * paceScale, then its radius (the size class). Never the drill law or prices. The felt speed reads
 * the ground the world holds (`drillPace.ts`): until a kernel seam binds a roster planet's size
 * class and k_s to generation, a planet is generated at system 1's radius at g, k_jump harder.
 */
import { planetMediansOf, type PlanetMedians } from '../../logging/drillPaceBars'
import type { DrillPaceTally } from '../../logging/drillPace'
import type { RadiusRebaselineTally } from '../../logging/radiusRebaseline'
import { RADIUS_REBASELINE_BARS } from '../../logging/radiusRebaselineBars'
import {
  equilibriumRateStepOf,
  planetRadiusMediansOf,
  pStarOfRateStep,
  ratioOf,
  type PlanetRadiusMedians,
} from '../../logging/radiusRebaselineMedians'
import type { StarMapTravelTally } from '../../logging/starMapTravel'
import { STAR_MAP_TRAVEL_BARS } from '../../logging/starMapTravelBars'
import {
  cmp,
  div,
  floor,
  fromSafeInteger,
  mul,
  toSafeInteger,
  ZERO_MONEY,
} from '../../systems/money'
import { campaignIndex, planetIndexOfCampaign } from '../../systems/starMap/campaignIndex'
import { FIRST_DRAWN_SYSTEM, planetsPerSystem } from './systems/newContentSlots'

/** The re-baseline's name wherever its rows are written (GD lock point 2). */
export const SYSTEM_TWO_REBASELINE = 'solar system 2'

export const SYSTEM_TWO_PACE_BARS = {
  system: FIRST_DRAWN_SYSTEM,
  planetMinutes: RADIUS_REBASELINE_BARS.planetMinutes,
  feltRatioToPreviousMin: RADIUS_REBASELINE_BARS.feltRatioToPreviousMin,
  drillTipMajorsPerPlanet: RADIUS_REBASELINE_BARS.drillTipMajorsPerPlanet,
  pStar: RADIUS_REBASELINE_BARS.pStar.target,
  moneyRateToEquilibrium: RADIUS_REBASELINE_BARS.moneyRateToEquilibrium,
  fuelSpendBp: STAR_MAP_TRAVEL_BARS.fuelSpendBp,
} as const

/** One seed's run into system 2: the tallies keyed by campaign index, and the system's own leg. */
export interface SystemTwoPaceRun {
  worldSeed: number
  /** The whole run's drill pace: system 1's planets, then system 2's at their campaign index. */
  drill: DrillPaceTally
  radius: RadiusRebaselineTally
  /** Folded from the arrival in system 2 on: the spend the fuel share is judged on. */
  systemTwo: StarMapTravelTally
  /** Whether the bot made the jump out of system 1 into system 2. */
  hasJumped: boolean
}

/** One planet of system 2 on the median seed, beside the planet before it. */
interface SystemPlanetRow {
  planetIndex: number
  pace: PlanetMedians
  money: PlanetRadiusMedians
  before: { pace: PlanetMedians; money: PlanetRadiusMedians }
}

const BASIS_POINTS = 10000

/** System 2's planets as campaign indexes, in place order. */
export function systemTwoPlanetIndexes(): number[] {
  return Array.from({ length: planetsPerSystem() }, (_, at) =>
    planetIndexOfCampaign(campaignIndex(SYSTEM_TWO_PACE_BARS.system, BigInt(at + 1))),
  )
}

/** The drill pace medians run to planet 10, which holds system 2's last planet (g 10). */
function planetRowsOf(runs: readonly SystemTwoPaceRun[]): SystemPlanetRow[] {
  const planets = systemTwoPlanetIndexes()
  const reached = [planets[0] - 1, ...planets]
  const paces = planetMediansOf(runs.map(({ worldSeed, drill }) => ({ worldSeed, tally: drill })))
  const monies = planetRadiusMediansOf(runs, reached)
  const paceAt = (planet: number) => paces[planet - 1]
  const moneyAt = (planet: number) => monies[reached.indexOf(planet)]
  return planets.map((planetIndex) => ({
    planetIndex,
    pace: paceAt(planetIndex),
    money: moneyAt(planetIndex),
    before: { pace: paceAt(planetIndex - 1), money: moneyAt(planetIndex - 1) },
  }))
}

/** The bars the lane gates, as problems; empty when they hold. */
export function gatedSystemTwoPaceProblemsOf(runs: readonly SystemTwoPaceRun[]): string[] {
  const rows = planetRowsOf(runs)
  return [
    ...rows.flatMap(minutesProblems),
    ...rows.flatMap(feltRatioProblems),
    ...rows.flatMap(drillTipCadenceProblems),
    ...rows.flatMap(moneyRateProblems),
    ...fuelSpendProblems(runs),
    ...runs.flatMap(unopenedSystemProblems),
  ]
}

function minutesProblems({ planetIndex, pace }: SystemPlanetRow): string[] {
  const { min, max } = SYSTEM_TWO_PACE_BARS.planetMinutes
  if (pace.minutes === null)
    return [`${placeOf(planetIndex)} core never reached on the median seed`]
  if (pace.minutes >= min && pace.minutes <= max) return []
  return [`${placeOf(planetIndex)} takes ${pace.minutes.toFixed(1)} min, outside ${min} to ${max}`]
}

function feltRatioProblems({ planetIndex, pace, before }: SystemPlanetRow): string[] {
  const ratio = stepOf(pace.averageFelt, before.pace.averageFelt)
  if (ratio === null || ratio >= SYSTEM_TWO_PACE_BARS.feltRatioToPreviousMin) return []
  return [
    `${placeOf(planetIndex)} felt speed ${ratio.toFixed(2)}x the planet before, under ` +
      `${SYSTEM_TWO_PACE_BARS.feltRatioToPreviousMin}`,
  ]
}

function drillTipCadenceProblems({ planetIndex, pace }: SystemPlanetRow): string[] {
  const { min, max } = SYSTEM_TWO_PACE_BARS.drillTipMajorsPerPlanet
  const majors = pace.drillTipMajors
  if (majors === null || (majors >= min && majors <= max)) return []
  return [`${placeOf(planetIndex)} lands ${majors} drill + tip majors, outside ${min} to ${max}`]
}

function moneyRateProblems(row: SystemPlanetRow): string[] {
  const step = moneyStepOf(row)
  if (step === null) return []
  const { min, max } = SYSTEM_TWO_PACE_BARS.moneyRateToEquilibrium
  const equilibrium = equilibriumRateStepOf(row.planetIndex, SYSTEM_TWO_PACE_BARS.pStar)
  const share = step / equilibrium
  if (share >= min && share <= max) return []
  return [
    `${placeOf(row.planetIndex)} money per minute x${step.toFixed(2)} the planet before, ` +
      `${share.toFixed(2)}x the #551 equilibrium x${equilibrium.toFixed(2)}, outside +/- 5%`,
  ]
}

/** The money-per-minute step from the planet before; null where either core was not reached. */
function moneyStepOf({ money, before }: SystemPlanetRow): number | null {
  const after = money.moneyPerMinute
  const from = before.money.moneyPerMinute
  return after === null || from === null ? null : ratioOf(after, from)
}

function fuelSpendProblems(runs: readonly SystemTwoPaceRun[]): string[] {
  const share = medianOf(runs.map(fuelShareBpOf))
  const { min, max } = SYSTEM_TWO_PACE_BARS.fuelSpendBp
  if (share !== null && share >= min && share <= max) return []
  return [`fuel is ${share ?? 'no'} bp of the money spent in system 2, outside ${min}-${max}`]
}

/** The fuel bought in system 2 over all the money spent there, in basis points. */
export function fuelShareBpOf(run: SystemTwoPaceRun): number | null {
  const { total, fuel } = run.systemTwo.spend
  if (cmp(total, ZERO_MONEY) === 0) return null
  return toSafeInteger(floor(div(mul(fuel, fromSafeInteger(BASIS_POINTS)), total)))
}

function unopenedSystemProblems(run: SystemTwoPaceRun): string[] {
  if (!run.hasJumped) return [`seed ${run.worldSeed} never jumped into system 2`]
  const shut = systemTwoPlanetIndexes().find((planet) => !isCoreReached(run, planet))
  if (shut === undefined) return []
  return [`seed ${run.worldSeed} never completed ${placeOf(shut)}'s core`]
}

function isCoreReached(run: SystemTwoPaceRun, planet: number): boolean {
  return run.radius.planets.get(planet)?.coreTick != null
}

/** The bars the lane prints and never gates, each as a line. */
export function printedSystemTwoPaceLinesOf(runs: readonly SystemTwoPaceRun[]): string[] {
  const rows = planetRowsOf(runs)
  return [
    ...rows.flatMap(moneyStepLines),
    ...rows.flatMap(drillTipAmberLines),
    ...fuelShareLines(runs),
    ...rows.flatMap(fixOrderLines),
  ]
}

function moneyStepLines(row: SystemPlanetRow): string[] {
  const step = moneyStepOf(row)
  if (step === null) return []
  const pStar = pStarOfRateStep(row.planetIndex, step)
  return [
    `${placeOf(row.planetIndex)}: money per minute x${step.toFixed(2)}, p* ${pStar.toFixed(3)}`,
  ]
}

function drillTipAmberLines({ planetIndex, pace }: SystemPlanetRow): string[] {
  const isAmber = pace.drillTipMajors === SYSTEM_TWO_PACE_BARS.drillTipMajorsPerPlanet.amber
  return isAmber ? [`${placeOf(planetIndex)} amber: ${pace.drillTipMajors} drill + tip majors`] : []
}

function fuelShareLines(runs: readonly SystemTwoPaceRun[]): string[] {
  const share = medianOf(runs.map(fuelShareBpOf))
  return share === null ? [] : [`system 2: fuel ${share} bp of the money spent there`]
}

/** A planet outside 22-30 min names the lock's fix order (VS input on #774). */
function fixOrderLines({ planetIndex, pace }: SystemPlanetRow): string[] {
  const { min, max } = SYSTEM_TWO_PACE_BARS.planetMinutes
  if (pace.minutes === null || (pace.minutes >= min && pace.minutes <= max)) return []
  return [
    `${placeOf(planetIndex)} misses ${min}-${max} min: retune the step (k_jump, k_s) first, ` +
      'then its paceScale, then its radius (size class); never the drill law or prices',
  ]
}

/** `S2P<p> (g <g>)`: the place in system 2 and the campaign index the tallies key on. */
export function placeOf(planetIndex: number): string {
  const place = systemTwoPlanetIndexes().indexOf(planetIndex) + 1
  return `S2P${place} (g ${planetIndex})`
}

function stepOf(after: number | null, before: number | null): number | null {
  if (after === null || before === null || before === 0) return null
  return after / before
}

/** The middle value, a null (never reached) sorting after every number. */
function medianOf(values: readonly (number | null)[]): number | null {
  const sorted = [...values].sort((a, b) => (a ?? Infinity) - (b ?? Infinity))
  return sorted[Math.floor(sorted.length / 2)] ?? null
}
