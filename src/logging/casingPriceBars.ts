/**
 * The bars of #894's casing rise (Bjor's playtest, GD lock 25 Oct) a bot run judges, each on the
 * median of the pacing seeds (#84), planets 1 to 5:
 *
 *   share    casing (grades + lining) 12% to 20% of everything bought on each planet, travel
 *            excluded (the explicit spend-share row that replaces #662's at most 6%)
 *   arrival  on each jump in (P2-P5) the next casing grade costs at most 25% of the money held
 *   printed  each planet's share, its arrival share and its collapses, which the Tester sets beside
 *            main's run (collapses on the median run must not rise)
 *
 * The pacing rows (22-30 min a planet, felt speed at least 0.9x, every core reached) are the R3
 * lane's and #551's, which judge the same bot on the same seeds. A miss is re-tuned through
 * `kCasing`, then the grade base, never by changing a bar or the 1.225 ratio (#894).
 */
import { cmp, ZERO_MONEY } from '../systems/money'
import type { CasingSpendTally, PlanetCasingSpend } from './casingSpend'
import { ratioOf } from './radiusRebaselineMedians'

export const CASING_PRICE_BARS = {
  lastPlanet: 5,
  firstArrivalPlanet: 2,
  casingShareBp: { min: 1200, max: 2000 },
  arrivalShareBpMax: 2500,
} as const

const BASIS_POINTS = 10000

/** One seed's run: its casing tally. */
export interface CasingPriceRun {
  worldSeed: number
  casing: CasingSpendTally
}

/** One planet's medians over the seeds; null where no seed reached it. */
export interface CasingPlanetMedians {
  planet: number
  casingShareBp: number | null
  arrivalShareBp: number | null
  collapses: number | null
}

/** The gated bars as problems; empty when they hold. */
export function casingPriceProblemsOf(runs: readonly CasingPriceRun[]): string[] {
  return casingPlanetMediansOf(runs).flatMap((row) => [
    ...casingShareProblems(row),
    ...arrivalShareProblems(row),
  ])
}

/** One line per planet for the lane's log. */
export function casingPriceLinesOf(runs: readonly CasingPriceRun[]): string[] {
  return casingPlanetMediansOf(runs).map(
    ({ planet, casingShareBp, arrivalShareBp, collapses }) =>
      `P${planet}: casing ${percentText(casingShareBp)} of spend, next grade on arrival ` +
      `${percentText(arrivalShareBp)} of money held, collapses ${collapses ?? 'n/a'}`,
  )
}

export function casingPlanetMediansOf(runs: readonly CasingPriceRun[]): CasingPlanetMedians[] {
  return planetsToJudge().map((planet) => {
    const rows = runs.map((run) => run.casing.planets.get(planet))
    return {
      planet,
      casingShareBp: medianOf(rows.map(casingShareBpOf)),
      arrivalShareBp: medianOf(rows.map(arrivalShareBpOf)),
      collapses: medianOf(rows.map((row) => row?.collapses ?? null)),
    }
  })
}

/** Casing's share of the planet's spend in basis points; null where nothing was bought. */
export function casingShareBpOf(row: PlanetCasingSpend | undefined): number | null {
  if (row === undefined || cmp(row.spend, ZERO_MONEY) <= 0) return null
  return Math.floor(ratioOf(row.casingSpend, row.spend) * BASIS_POINTS)
}

/** The next grade's price over the money held on arrival; null with nothing held. */
export function arrivalShareBpOf(row: PlanetCasingSpend | undefined): number | null {
  if (row === undefined || cmp(row.arrivalWallet, ZERO_MONEY) <= 0) return null
  return Math.ceil(ratioOf(row.arrivalGradePrice, row.arrivalWallet) * BASIS_POINTS)
}

function casingShareProblems({ planet, casingShareBp }: CasingPlanetMedians): string[] {
  const { min, max } = CASING_PRICE_BARS.casingShareBp
  if (casingShareBp === null) return [`P${planet}: no seed bought anything there`]
  if (casingShareBp >= min && casingShareBp <= max) return []
  return [`P${planet}: casing is ${percentText(casingShareBp)} of spend, outside 12%-20%`]
}

function arrivalShareProblems({ planet, arrivalShareBp }: CasingPlanetMedians): string[] {
  if (planet < CASING_PRICE_BARS.firstArrivalPlanet) return []
  if (arrivalShareBp === null) return [`P${planet}: no seed arrived with money`]
  if (arrivalShareBp <= CASING_PRICE_BARS.arrivalShareBpMax) return []
  return [`P${planet}: the next grade costs ${percentText(arrivalShareBp)} of money on arrival`]
}

function planetsToJudge(): number[] {
  return Array.from({ length: CASING_PRICE_BARS.lastPlanet }, (_, index) => index + 1)
}

/** The middle value of the known ones; null when none is known. */
function medianOf(values: readonly (number | null)[]): number | null {
  const known = values.filter((value): value is number => value !== null).sort((a, b) => a - b)
  return known.length === 0 ? null : known[Math.floor((known.length - 1) / 2)]
}

function percentText(bp: number | null): string {
  return bp === null ? 'n/a' : `${(bp / 100).toFixed(2)}%`
}
