/**
 * The bars of the tools on/off replay (ticket 881, PK4c T1; Systems on #850 and the VS's
 * condition, adopted by the GD's lock), each on the median of the pacing seeds (#84), one tools-on
 * run per hazard tool against the bare run, on the tool's home planet:
 *
 *   payback     (money per minute with the tool − bare money per minute) × minutes the tool acted
 *               there (the tail counts; the flask's open window), over the price its grant debited
 *               in the run's ledger (`kit_item_granted`): 1 to 3. A miss is tuned by the price in
 *               data, never the factor (Systems).
 *   felt speed  the time to the home planet's core, planets 1 to home summed, tools on within ±5%
 *               of bare: time-weighted over the whole run, not just the acting windows (VS).
 *   floor       no planet of a tools-on run under 22 minutes where the bare run holds 22. A planet
 *               the bare run already takes under 22 is the bare bot's finding (the R3 lane's).
 *
 * Every row is printed with its numbers, so a miss shows its size.
 */
import { BASIS_POINTS } from '../../constants/balance'
import { TICKS_PER_SECOND } from '../../constants/physics'
import { planetMediansOf } from '../../logging/drillPaceBars'
import { planetRadiusMediansOf, ratioOf } from '../../logging/radiusRebaselineMedians'
import { cmp, fromSafeInteger, mul, sub, ZERO_MONEY, type Money } from '../../systems/money'
import type { ToolPaceRun } from './toolPaceRuns'

export const TOOL_PACE_BARS = {
  payback: { min: 1, max: 3 },
  feltSpeedToleranceBp: 500,
  planetMinutesMin: 22,
} as const

const TICKS_PER_MINUTE = 60 * TICKS_PER_SECOND

/** One tool's home-planet numbers against the bare run's. */
export interface ToolPaceRow {
  itemId: string
  planet: number
  payback: number | null
  /** Minutes to the home core, planets 1 to home, tools on and bare. */
  minutesOn: number | null
  minutesBare: number | null
  actingMinutes: number
  /** Planets of the tools-on run under the floor where the bare run holds it. */
  planetsUnderFloor: readonly number[]
}

/** Each tool's row from its runs and the bare runs. */
export function toolPaceRowsOf(
  bare: readonly ToolPaceRun[],
  tools: readonly (readonly ToolPaceRun[])[],
): ToolPaceRow[] {
  return tools.filter((runs) => runs.length > 0).map((runs) => toolRowOf(bare, runs))
}

/** The gated bars as problems; empty when they hold. */
export function toolPaceProblemsOf(rows: readonly ToolPaceRow[]): string[] {
  return rows.flatMap((row) => [
    ...paybackProblems(row),
    ...feltSpeedProblems(row),
    ...row.planetsUnderFloor.map(
      (planet) => `${row.itemId}: planet ${planet} under ${TOOL_PACE_BARS.planetMinutesMin} min`,
    ),
  ])
}

export function toolPaceLinesOf(rows: readonly ToolPaceRow[]): string[] {
  return [
    '| tool | home | payback | acting min | min to home core on | bare | under 22 |',
    ...rows.map(
      (row) =>
        `| ${row.itemId} | ${row.planet} | ${numberText(row.payback, 2)} | ` +
        `${row.actingMinutes.toFixed(1)} | ${numberText(row.minutesOn, 1)} | ` +
        `${numberText(row.minutesBare, 1)} | ${row.planetsUnderFloor.join(', ') || '-'} |`,
    ),
  ]
}

function toolRowOf(bare: readonly ToolPaceRun[], runs: readonly ToolPaceRun[]): ToolPaceRow {
  const { hand } = runs[0]
  const planet = hand.lastPlanet
  const actingTicks = medianOf(runs.map((run) => run.actingTicks.get(planet) ?? 0)) ?? 0
  return {
    itemId: hand.itemId ?? 'bare',
    planet,
    payback: paybackOf(moneyRateOn(runs, planet), moneyRateOn(bare, planet), {
      actingTicks,
      debit: runs[0].ledgerDebit,
    }),
    minutesOn: minutesToCoreOf(runs, planet),
    minutesBare: minutesToCoreOf(bare, planet),
    actingMinutes: actingTicks / TICKS_PER_MINUTE,
    planetsUnderFloor: planetsUnderFloorOf(runs, bare, planet),
  }
}

/** `(rateOn − rateBare) × acting minutes / debit`; null with a rate never reached or no debit. */
export function paybackOf(
  rateOn: Money | null,
  rateBare: Money | null,
  spent: { actingTicks: number; debit: Money },
): number | null {
  if (rateOn === null || rateBare === null || cmp(spent.debit, ZERO_MONEY) === 0) return null
  const gained = mul(sub(rateOn, rateBare), fromSafeInteger(spent.actingTicks))
  return ratioOf(gained, mul(spent.debit, fromSafeInteger(TICKS_PER_MINUTE)))
}

function moneyRateOn(runs: readonly ToolPaceRun[], planet: number): Money | null {
  const planets = Array.from({ length: planet }, (_, at) => at + 1)
  return planetRadiusMediansOf(runs, planets)[planet - 1]?.moneyPerMinute ?? null
}

/** The planets' median minutes summed, 1 to `planet`; null while one was never finished. */
function minutesToCoreOf(runs: readonly ToolPaceRun[], planet: number): number | null {
  const minutes = planetMinutesOf(runs).slice(0, planet)
  if (minutes.length < planet || minutes.some((value) => value === null)) return null
  return (minutes as number[]).reduce((total, value) => total + value, 0)
}

function planetMinutesOf(runs: readonly ToolPaceRun[]): (number | null)[] {
  return planetMediansOf(runs.map(({ worldSeed, drill }) => ({ worldSeed, tally: drill }))).map(
    (medians) => medians.minutes,
  )
}

function planetsUnderFloorOf(
  runs: readonly ToolPaceRun[],
  bare: readonly ToolPaceRun[],
  planet: number,
): number[] {
  const on = planetMinutesOf(runs)
  const off = planetMinutesOf(bare)
  return on
    .slice(0, planet)
    .flatMap((minutes, at) => (isUnderFloor(minutes) && !isUnderFloor(off[at]) ? [at + 1] : []))
}

function isUnderFloor(minutes: number | null | undefined): boolean {
  return typeof minutes === 'number' && minutes < TOOL_PACE_BARS.planetMinutesMin
}

function paybackProblems(row: ToolPaceRow): string[] {
  const { min, max } = TOOL_PACE_BARS.payback
  if (row.payback !== null && row.payback >= min && row.payback <= max) return []
  return [
    `${row.itemId}: payback ${numberText(row.payback, 2)}x its price on planet ${row.planet}, ` +
      `outside ${min} to ${max}: tune its price in data`,
  ]
}

function feltSpeedProblems(row: ToolPaceRow): string[] {
  if (isWithinFeltSpeed(row.minutesOn, row.minutesBare)) return []
  return [
    `${row.itemId}: ${numberText(row.minutesOn, 1)} min to planet ${row.planet}'s core, ` +
      `outside 5% of bare's ${numberText(row.minutesBare, 1)}`,
  ]
}

function isWithinFeltSpeed(on: number | null, bare: number | null): boolean {
  if (on === null || bare === null) return false
  return Math.abs(on - bare) * BASIS_POINTS <= bare * TOOL_PACE_BARS.feltSpeedToleranceBp
}

function numberText(value: number | null, digits: number): string {
  return value === null ? 'never' : value.toFixed(digits)
}

/** The middle of the known values, the lower middle of an even count; null with none known. */
function medianOf(values: readonly number[]): number | null {
  const known = [...values].sort((a, b) => a - b)
  return known.length === 0 ? null : known[Math.floor((known.length - 1) / 2)]
}
