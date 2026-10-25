/**
 * The bars of the crates on/off replay (ticket 850; #823's VS row 1, adopted by the GD's lock on
 * #823 and moved to #850 by the final lock on #850), each on the median of the pacing seeds (#84),
 * planets 1 to 5:
 *
 *   gated   with crates on, each planet takes 22 to 30 minutes to its core; each money-per-minute
 *           step from the planet before is within 5% of the #551 equilibrium step (R3's bar); and
 *           the cargo hold level the bot leaves each planet with is at most 1 below crates-off's.
 *           A time or money bar the crates-off run misses as well is the bare bot's pacing finding
 *           (the R3 lane's), not the crate's: it is printed and not gated here.
 *   printed each planet's minutes, money step and cargo level both ways, and the crates bought,
 *           dropped and picked up per seed.
 *
 * A miss is a balance finding for the crate: tune its price or cap, never the cargo curve (VS).
 */
import { planetMediansOf } from '../../logging/drillPaceBars'
import { RADIUS_REBASELINE_BARS } from '../../logging/radiusRebaselineBars'
import {
  equilibriumRateStepOf,
  planetRadiusMediansOf,
  ratioOf,
} from '../../logging/radiusRebaselineMedians'
import type { Money } from '../../systems/money'
import { CRATE_PACE_LAST_PLANET, type CratePaceRun } from './cratePaceRuns'

export const CRATE_PACE_BARS = {
  planetMinutes: RADIUS_REBASELINE_BARS.planetMinutes,
  moneyRateToEquilibrium: RADIUS_REBASELINE_BARS.moneyRateToEquilibrium,
  pStar: RADIUS_REBASELINE_BARS.pStar.target,
  cargoLevelsBehindMax: 1,
} as const

const PLANETS = Array.from({ length: CRATE_PACE_LAST_PLANET }, (_, at) => at + 1)

/** One planet's medians under one crate policy. */
interface CratePlanetRow {
  planet: number
  minutes: number | null
  /** Money per minute over the planet before's; null on planet 1 or a core never reached. */
  moneyStep: number | null
  cargoLevel: number | null
}

/** One planet both ways. */
interface CratePlanetPair {
  off: CratePlanetRow
  on: CratePlanetRow
}

/** The gated bars as problems; empty when they hold. */
export function cratePaceProblemsOf(
  off: readonly CratePaceRun[],
  on: readonly CratePaceRun[],
): string[] {
  return pairsOf(off, on).flatMap((pair) => [
    ...minutesProblems(pair),
    ...moneyStepProblems(pair),
    ...cargoLevelProblems(pair),
  ])
}

/** The printed rows: per planet both ways, then what the crates did per seed. */
export function cratePaceLinesOf(
  off: readonly CratePaceRun[],
  on: readonly CratePaceRun[],
): string[] {
  return [
    '| planet | minutes off | minutes on | money step off | money step on | #551 step | cargo off | cargo on |',
    ...pairsOf(off, on).map(pairLineOf),
    ...on.map(crateUseLineOf),
  ]
}

function pairsOf(off: readonly CratePaceRun[], on: readonly CratePaceRun[]): CratePlanetPair[] {
  const offRows = rowsOf(off)
  const onRows = rowsOf(on)
  return PLANETS.map((_, at) => ({ off: offRows[at], on: onRows[at] }))
}

function rowsOf(runs: readonly CratePaceRun[]): CratePlanetRow[] {
  const paces = planetMediansOf(runs.map(({ worldSeed, drill }) => ({ worldSeed, tally: drill })))
  const money = planetRadiusMediansOf(runs, PLANETS)
  return PLANETS.map((planet, at) => ({
    planet,
    minutes: paces.find((pace) => pace.planet === planet)?.minutes ?? null,
    moneyStep: stepOf(money[at]?.moneyPerMinute ?? null, money[at - 1]?.moneyPerMinute ?? null),
    cargoLevel: medianOf(runs.map((run) => run.cargoLevels.get(planet) ?? null)),
  }))
}

function stepOf(after: Money | null, before: Money | null): number | null {
  return after === null || before === null ? null : ratioOf(after, before)
}

function minutesProblems({ off, on }: CratePlanetPair): string[] {
  if (isWithinMinutes(on.minutes) || !isWithinMinutes(off.minutes)) return []
  return [
    `crates on: planet ${on.planet} takes ${minutesText(on.minutes)} min, outside 22 to 30 ` +
      `(crates off ${minutesText(off.minutes)} min)`,
  ]
}

function moneyStepProblems({ off, on }: CratePlanetPair): string[] {
  if (isNearEquilibrium(on) || !isNearEquilibrium(off)) return []
  return [
    `crates on: planet ${on.planet} money per minute x${on.moneyStep?.toFixed(2) ?? 'never'} ` +
      `the planet before, outside 5% of the #551 x${equilibriumOf(on.planet).toFixed(2)} ` +
      `(crates off x${off.moneyStep?.toFixed(2) ?? 'never'})`,
  ]
}

function cargoLevelProblems({ off, on }: CratePlanetPair): string[] {
  if (off.cargoLevel === null || on.cargoLevel === null) return []
  if (off.cargoLevel - on.cargoLevel <= CRATE_PACE_BARS.cargoLevelsBehindMax) return []
  return [
    `crates on: planet ${on.planet} left with cargo hold level ${on.cargoLevel}, ` +
      `more than 1 below crates off's ${off.cargoLevel}`,
  ]
}

function isWithinMinutes(minutes: number | null): boolean {
  const { min, max } = CRATE_PACE_BARS.planetMinutes
  return minutes !== null && minutes >= min && minutes <= max
}

/** Planet 1 has no step to judge, so it always holds. */
function isNearEquilibrium(row: CratePlanetRow): boolean {
  if (row.planet === 1) return true
  if (row.moneyStep === null) return false
  const { min, max } = CRATE_PACE_BARS.moneyRateToEquilibrium
  const share = row.moneyStep / equilibriumOf(row.planet)
  return share >= min && share <= max
}

function equilibriumOf(planet: number): number {
  return equilibriumRateStepOf(planet, CRATE_PACE_BARS.pStar)
}

function pairLineOf({ off, on }: CratePlanetPair): string {
  const equilibrium = on.planet === 1 ? '-' : `x${equilibriumOf(on.planet).toFixed(2)}`
  const cells = [
    on.planet,
    minutesText(off.minutes),
    minutesText(on.minutes),
    stepText(off.moneyStep),
    stepText(on.moneyStep),
    equilibrium,
    off.cargoLevel ?? '-',
    on.cargoLevel ?? '-',
  ]
  return `| ${cells.join(' | ')} |`
}

function crateUseLineOf(run: CratePaceRun): string {
  return (
    `seed ${run.worldSeed} crates on: ${run.cratesBought} bought, ${run.cratesDropped} dropped, ` +
    `${run.cratesPickedUp} picked up`
  )
}

function minutesText(minutes: number | null): string {
  return minutes === null ? 'never' : minutes.toFixed(1)
}

function stepText(step: number | null): string {
  return step === null ? '-' : `x${step.toFixed(2)}`
}

/** The middle of the known values, the lower middle of an even count; null with none known. */
function medianOf(values: readonly (number | null)[]): number | null {
  const known = values.filter((value): value is number => value !== null).sort((a, b) => a - b)
  return known.length === 0 ? null : known[Math.floor((known.length - 1) / 2)]
}
