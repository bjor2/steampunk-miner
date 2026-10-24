/**
 * The star-map travel bars of ticket 756 (the Systems ruling on #756, the GD lock on #650 and the
 * VS bars recorded there) a bot run to planet 5's core judges, on the median of the pacing seeds
 * (#84), beside the R3 lane, which keeps gating planet minutes 22 to 30 and money per minute within
 * 5% of the #551 equilibrium (`radiusRebaselineBars.ts`):
 *
 *   gated   the hop's fee 8-12% of the wallet at core harvest and its charge at most 15%, on each
 *           P1->P5 hop; the #648 clamp binding on at most 1 of the 4 hops of any seed; a hop at
 *           most one run of the planet it leaves; P1->P2 paid by the first P1 haul; fuel 3-8% of
 *           the money spent and the tank track at most 6%; felt speed at least 0.9x the planet
 *           before; a planet jumped back to earning less a minute than the frontier
 *   printed each planet's median run against the R the fuel curve stands in, and the felt speed
 *           on arrival for the hop to the next planet and for a skip of one (p -> p+2)
 *
 * A miss is a balance finding for the fuel curve's provisional rows (`starMap.fuel` in
 * economy.json: `runValue`, then `tank.priceAtLevel1`), never the bot or the clamp.
 */
import { jumpFeeOf, runValueOf } from '../systems/economy/jumpFuel'
import {
  cmp,
  div,
  floor,
  fromSafeInteger,
  mul,
  toFixedText,
  toSafeInteger,
  ZERO_MONEY,
  type Money,
} from '../systems/money'
import { feltCellsPerSecond, type DrillPaceTally } from './drillPace'
import { planetMediansOf, type PlanetMedians } from './drillPaceBars'
import type { RadiusRebaselineTally, TravelHop } from './radiusRebaseline'
import { isHopClamped } from './radiusRebaselineMedians'
import type { StarMapTravelTally } from './starMapTravel'
import type { UpgradeLevels } from '../systems/economy/vehicleStats'

export const STAR_MAP_TRAVEL_BARS = {
  lastPlanet: 5,
  openingHopLastFrom: 4,
  feeShareBp: { min: 800, max: 1200 },
  chargeShareBpMax: 1500,
  clampedHopsPerSeedMax: 1,
  runShareBpMax: 10000,
  fuelSpendBp: { min: 300, max: 800 },
  tankSpendBpMax: 600,
  feltRatioToPreviousMin: 0.9,
} as const

/** One seed's run to planet 5's core: the drill pace, R3 and star-map tallies. */
export interface StarMapTravelRun {
  worldSeed: number
  drill: DrillPaceTally
  radius: RadiusRebaselineTally
  starMap: StarMapTravelTally
  /**
   * The levels the bot arrived in system 2 with after its jump out of planet 5, the drive and the
   * fuel paid (ticket 759, `systemJumpBars.ts`); null when the jump was refused. Absent in a run
   * that never tries it.
   */
  systemJumpLevels?: UpgradeLevels | null
}

/** One seed's money per minute on `planet` with the gear of the planet after it, and there. */
export interface BacktrackRun {
  worldSeed: number
  planet: number
  backtrackRate: Money | null
  frontierRate: Money | null
}

const BASIS_POINTS = 10000
const OPENING_HOPS = Array.from(
  { length: STAR_MAP_TRAVEL_BARS.openingHopLastFrom },
  (_, at) => at + 1,
)
const FELT_PLANETS = Array.from({ length: STAR_MAP_TRAVEL_BARS.lastPlanet }, (_, at) => at + 1)
const SKIP_DISTANCES = [1, 2]

/** The bars the lane gates, as problems; empty when they hold. */
export function gatedStarMapTravelProblemsOf(
  runs: readonly StarMapTravelRun[],
  backtracks: readonly BacktrackRun[],
): string[] {
  return [
    ...OPENING_HOPS.flatMap((planet) => feeShareProblems(runs, planet)),
    ...OPENING_HOPS.flatMap((planet) => chargeShareProblems(runs, planet)),
    ...runs.flatMap(clampedHopProblems),
    ...OPENING_HOPS.flatMap((planet) => runShareProblems(runs, planet)),
    ...firstHaulProblems(runs),
    ...fuelSpendProblems(runs),
    ...tankSpendProblems(runs),
    ...feltRatioProblems(feltMediansOf(runs)),
    ...backtrackPlanetsOf(backtracks).flatMap((planet) => backtrackProblems(backtracks, planet)),
  ]
}

function feeShareProblems(runs: readonly StarMapTravelRun[], planet: number): string[] {
  const share = medianOf(runs.map((run) => hopShareBpOf(run, planet, (hop) => hop.listFee)))
  const { min, max } = STAR_MAP_TRAVEL_BARS.feeShareBp
  if (share === null || (share >= min && share <= max)) return []
  return [`hop P${planet}->P${planet + 1} fee is ${share} bp of the core wallet, outside 800-1200`]
}

function chargeShareProblems(runs: readonly StarMapTravelRun[], planet: number): string[] {
  const share = medianOf(runs.map((run) => hopShareBpOf(run, planet, (hop) => hop.cost)))
  if (share === null || share <= STAR_MAP_TRAVEL_BARS.chargeShareBpMax) return []
  return [`hop P${planet}->P${planet + 1} charges ${share} bp of the core wallet, bar 1500`]
}

/** The hop's `amount` over the wallet at the core of the planet it left, in basis points. */
function hopShareBpOf(
  run: StarMapTravelRun,
  planet: number,
  amount: (hop: TravelHop) => Money,
): number | null {
  const hop = hopFrom(run, planet)
  const wallet = run.radius.planets.get(planet)?.walletAtCore ?? null
  if (hop === undefined || wallet === null) return null
  return shareBpOf(amount(hop), wallet)
}

function clampedHopProblems(run: StarMapTravelRun): string[] {
  const clamped = run.radius.hops.filter(isOpeningHop).filter(isHopClamped).length
  if (clamped <= STAR_MAP_TRAVEL_BARS.clampedHopsPerSeedMax) return []
  return [`seed ${run.worldSeed}: the #648 clamp bound on ${clamped} of the P1->P5 hops, bar 1`]
}

function isOpeningHop(hop: TravelHop): boolean {
  return hop.fromPlanet <= STAR_MAP_TRAVEL_BARS.openingHopLastFrom
}

function runShareProblems(runs: readonly StarMapTravelRun[], planet: number): string[] {
  const share = medianOf(runs.map((run) => runShareBpOf(run, planet)))
  if (share === null || share <= STAR_MAP_TRAVEL_BARS.runShareBpMax) return []
  return [`hop P${planet}->P${planet + 1} fee is ${share} bp of the planet's median run, bar 10000`]
}

function runShareBpOf(run: StarMapTravelRun, planet: number): number | null {
  const hop = hopFrom(run, planet)
  const runSale = medianMoneyOf(soldRunsOf(run, planet))
  if (hop === undefined || runSale === null) return null
  return shareBpOf(hop.listFee, runSale)
}

function firstHaulProblems(runs: readonly StarMapTravelRun[]): string[] {
  const haul = medianMoneyOf(runs.map((run) => soldRunsOf(run, 1)[0] ?? null))
  const fee = jumpFeeOf(1, 2)
  if (haul !== null && cmp(haul, fee) >= 0) return []
  const sold = haul === null ? 'nothing' : toFixedText(haul, 0)
  return [`the first P1 haul sells ${sold}, under the P1->P2 fee ${toFixedText(fee, 0)}`]
}

function fuelSpendProblems(runs: readonly StarMapTravelRun[]): string[] {
  const share = medianOf(runs.map((run) => spendShareBpOf(run, run.starMap.spend.fuel)))
  const { min, max } = STAR_MAP_TRAVEL_BARS.fuelSpendBp
  if (share !== null && share >= min && share <= max) return []
  return [`fuel is ${share ?? 'no'} bp of the money spent, outside 300-800`]
}

function tankSpendProblems(runs: readonly StarMapTravelRun[]): string[] {
  const share = medianOf(runs.map((run) => spendShareBpOf(run, run.starMap.spend.tank)))
  if (share === null || share <= STAR_MAP_TRAVEL_BARS.tankSpendBpMax) return []
  return [`the tank track is ${share} bp of the money spent, bar 600`]
}

function spendShareBpOf(run: StarMapTravelRun, amount: Money): number | null {
  const total = run.starMap.spend.total
  return cmp(total, ZERO_MONEY) === 0 ? null : shareBpOf(amount, total)
}

function feltMediansOf(runs: readonly StarMapTravelRun[]): PlanetMedians[] {
  const medians = planetMediansOf(runs.map(({ worldSeed, drill }) => ({ worldSeed, tally: drill })))
  return medians.filter((median) => median.planet <= STAR_MAP_TRAVEL_BARS.lastPlanet)
}

function feltRatioProblems(medians: readonly PlanetMedians[]): string[] {
  return medians.flatMap((median, at) => {
    const ratio = stepOf(median.averageFelt, medians[at - 1]?.averageFelt ?? null)
    if (ratio === null || ratio >= STAR_MAP_TRAVEL_BARS.feltRatioToPreviousMin) return []
    return [`planet ${median.planet} felt speed ${ratio.toFixed(2)}x the planet before, under 0.9`]
  })
}

function backtrackPlanetsOf(backtracks: readonly BacktrackRun[]): number[] {
  return [...new Set(backtracks.map((run) => run.planet))].sort((a, b) => a - b)
}

/** VS: going back to a cleared planet must not beat the frontier's money per minute. */
function backtrackProblems(backtracks: readonly BacktrackRun[], planet: number): string[] {
  const seeds = backtracks.filter((run) => run.planet === planet)
  const back = medianMoneyOf(seeds.map((run) => run.backtrackRate))
  const front = medianMoneyOf(seeds.map((run) => run.frontierRate))
  if (back === null || front === null || cmp(back, front) < 0) return []
  return [
    `back on planet ${planet} earns ${toFixedText(back, 1)} a minute, not under the ` +
      `frontier's ${toFixedText(front, 1)} on planet ${planet + 1}`,
  ]
}

/** The lines the lane prints and never gates. */
export function printedStarMapTravelLinesOf(
  runs: readonly StarMapTravelRun[],
  backtracks: readonly BacktrackRun[],
): string[] {
  return [
    ...FELT_PLANETS.map((planet) => runValueLine(runs, planet)),
    ...OPENING_HOPS.flatMap((planet) => arrivalFeltLines(runs, planet)),
    ...backtrackPlanetsOf(backtracks).map((planet) => backtrackLine(backtracks, planet)),
  ]
}

function runValueLine(runs: readonly StarMapTravelRun[], planet: number): string {
  const runSale = medianMoneyOf(runs.map((run) => medianMoneyOf(soldRunsOf(run, planet))))
  const measured = runSale === null ? 'never' : toFixedText(runSale, 0)
  return `planet ${planet}: median run sells ${measured}, the fuel curve stands R in at ${toFixedText(runValueOf(planet), 0)}`
}

/** Felt speed on arriving `distance` planets on with the levels the bot left `planet` with. */
function arrivalFeltLines(runs: readonly StarMapTravelRun[], planet: number): string[] {
  const before = feltMediansOf(runs).find((median) => median.planet === planet)?.averageFelt ?? null
  return SKIP_DISTANCES.flatMap((distance) => {
    const arrival = medianOf(runs.map((run) => arrivalFeltOf(run, planet, distance)))
    const ratio = stepOf(arrival, before)
    if (ratio === null || arrival === null) return []
    return [
      `hop P${planet}->P${planet + distance}: felt ${arrival.toFixed(2)} cells/s on arrival, ` +
        `${ratio.toFixed(2)}x planet ${planet}'s average`,
    ]
  })
}

function arrivalFeltOf(run: StarMapTravelRun, planet: number, distance: number): number | null {
  const levels = run.starMap.departureLevels.get(planet)
  return levels === undefined ? null : feltCellsPerSecond(levels, planet + distance)
}

function backtrackLine(backtracks: readonly BacktrackRun[], planet: number): string {
  const seeds = backtracks.filter((run) => run.planet === planet)
  const back = medianMoneyOf(seeds.map((run) => run.backtrackRate))
  const front = medianMoneyOf(seeds.map((run) => run.frontierRate))
  return `back on planet ${planet}: ${rateText(back)} a minute, frontier planet ${planet + 1}: ${rateText(front)}`
}

function rateText(rate: Money | null): string {
  return rate === null ? 'never' : toFixedText(rate, 1)
}

function hopFrom(run: StarMapTravelRun, planet: number): TravelHop | undefined {
  return run.radius.hops.find((hop) => hop.fromPlanet === planet)
}

/** The runs that sold anything: a run with an empty hold is no run sale. */
function soldRunsOf(run: StarMapTravelRun, planet: number): Money[] {
  return (run.starMap.runSales.get(planet) ?? []).filter((sale) => cmp(sale, ZERO_MONEY) > 0)
}

function shareBpOf(amount: Money, whole: Money): number {
  if (cmp(whole, ZERO_MONEY) <= 0) return BASIS_POINTS
  return toSafeInteger(floor(div(mul(amount, fromSafeInteger(BASIS_POINTS)), whole)))
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

function medianMoneyOf(values: readonly (Money | null)[]): Money | null {
  const sorted = [...values].sort(compareMoneyNullLast)
  return sorted[Math.floor(sorted.length / 2)] ?? null
}

function compareMoneyNullLast(a: Money | null, b: Money | null): number {
  if (a === null || b === null) return (a === null ? 1 : 0) - (b === null ? 1 : 0)
  return cmp(a, b)
}
