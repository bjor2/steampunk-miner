/**
 * The bars of ticket 899's diagonal-heavy casing check (the VS's check on #833, moved to #899 by
 * the GD on 25 Oct), each on the median of the pacing seeds (#84), planets 1 to 5. The same bot
 * plays each seed twice: its default (cardinal) galleries, and the diagonal-heavy zigzags whose
 * tunnel runs mostly at 45° (`digPolicy`). The diagonal-heavy run is held to:
 *
 *   share     at least half of the tunnel it cuts at 45°
 *   minutes   22 to 30 minutes from arrival to each core
 *   money     money per minute within ±5% of the cardinal run's, the bot on the #551 curve
 *   casing    grades + lining 12% to 20% of everything bought (#894's band, in force since #894
 *             landed; the ≤6% one was #662's before it)
 *   arrival   the next grade at most 25% of the money held on each jump in (#894's dock guard; the
 *             ≤8% catch-up guard is #829's, still to land, and the bot holds it by the same rule
 *             because it pays the authority's bill and estimates no casing of its own)
 *   billing   every ring priced by the per-metre lining rule alone, no angle term (HS condition 1),
 *             in both runs; and the lining billed per metre cut within 0.85x to 1.10x the
 *             cardinal run's: billed per metre of path, √2 m a 45° tile, where a bill per metre
 *             of depth would read about 0.71x and a √2 angle multiplier about 1.4x. The zigzag's
 *             corners shorten the stamp's centre line a little, which is the rule, not a discount
 *   printed   both runs' rows and each planet's collapses, for the Tester beside main's run
 *
 * A miss is a balance finding reported with the trace (`diagonal-heavy.comparison.ndjson`);
 * constants are never retuned just to pass it (#899).
 */
import { TICKS_PER_SECOND } from '../constants/physics'
import type { DigPolicy } from '../systems/bot/mineLayout'
import { cmp, div, fromSafeInteger, type Money } from '../systems/money'
import { arrivalShareBpOf, casingShareBpOf } from './casingPriceBars'
import type { CasingSpendTally } from './casingSpend'
import { billedPerCutMetreOf, diagonalShareBpOf, type DigTally } from './diagonalDig'
import type { RadiusRebaselineTally } from './radiusRebaseline'
import { ratioOf } from './radiusRebaselineMedians'

export const DIAGONAL_HEAVY_BARS = {
  lastPlanet: 5,
  firstArrivalPlanet: 2,
  diagonalShareBpMin: 5000,
  planetMinutes: { min: 22, max: 30 },
  moneyPerMinuteRatio: { min: 0.95, max: 1.05 },
  casingShareBp: { min: 1200, max: 2000 },
  arrivalShareBpMax: 2500,
  billedPerCutRatio: { min: 0.85, max: 1.1 },
} as const

const TICKS_PER_MINUTE = 60 * TICKS_PER_SECOND

/** One seed's run under one dig policy: its pace, casing and dig tallies. */
export interface DigPolicyRun {
  worldSeed: number
  digPolicy: DigPolicy
  radius: RadiusRebaselineTally
  casing: CasingSpendTally
  dig: DigTally
}

/** One planet's numbers in one run; null where the run never got that far. */
export interface DigPolicyPlanet {
  planet: number
  minutes: number | null
  moneyPerMinute: Money | null
  casingShareBp: number | null
  arrivalShareBp: number | null
  diagonalShareBp: number | null
  billedPerCut: number | null
  offRulePrices: number
  collapses: number | null
}

/** One planet's medians over the seeds under each policy. */
export interface DigPolicyComparison {
  planet: number
  cardinal: DigPolicyPlanet
  diagonal: DigPolicyPlanet
}

/** The gated bars as problems; empty when they hold. */
export function diagonalHeavyProblemsOf(runs: readonly DigPolicyRun[]): string[] {
  return diagonalHeavyComparisonsOf(runs).flatMap((row) => [
    ...shareProblems(row),
    ...minutesProblems(row),
    ...moneyProblems(row),
    ...casingProblems(row),
    ...arrivalProblems(row),
    ...billingProblems(row),
  ])
}

/** Two lines a planet for the lane's log: the diagonal-heavy run's medians, then the cardinal's. */
export function diagonalHeavyLinesOf(runs: readonly DigPolicyRun[]): string[] {
  return diagonalHeavyComparisonsOf(runs).flatMap(({ planet, cardinal, diagonal }) => [
    `P${planet} diagonal-heavy: ${planetText(diagonal)}`,
    `P${planet} cardinal:       ${planetText(cardinal)}`,
  ])
}

export function diagonalHeavyComparisonsOf(runs: readonly DigPolicyRun[]): DigPolicyComparison[] {
  return planetsToJudge().map((planet) => ({
    planet,
    cardinal: planetMediansOf(runsUnder(runs, 'cardinal'), planet),
    diagonal: planetMediansOf(runsUnder(runs, 'diagonal_heavy'), planet),
  }))
}

/** One run's numbers on one planet. */
export function planetOfRun(run: DigPolicyRun, planet: number): DigPolicyPlanet {
  const casing = run.casing.planets.get(planet)
  const dig = run.dig.planets.get(planet)
  return {
    planet,
    minutes: minutesToCoreOf(run, planet),
    moneyPerMinute: moneyPerMinuteOf(run, planet),
    casingShareBp: casingShareBpOf(casing),
    arrivalShareBp: arrivalShareBpOf(casing),
    diagonalShareBp: dig === undefined ? null : diagonalShareBpOf(dig),
    billedPerCut: dig === undefined ? null : billedPerCutMetreOf(dig),
    offRulePrices: dig?.offRulePrices ?? 0,
    collapses: casing?.collapses ?? null,
  }
}

function runsUnder(runs: readonly DigPolicyRun[], digPolicy: DigPolicy): DigPolicyRun[] {
  return runs.filter((run) => run.digPolicy === digPolicy)
}

function planetMediansOf(runs: readonly DigPolicyRun[], planet: number): DigPolicyPlanet {
  const rows = runs.map((run) => planetOfRun(run, planet))
  return {
    planet,
    minutes: medianOf(rows.map((row) => row.minutes)),
    moneyPerMinute: medianMoneyOf(rows.map((row) => row.moneyPerMinute)),
    casingShareBp: medianOf(rows.map((row) => row.casingShareBp)),
    arrivalShareBp: medianOf(rows.map((row) => row.arrivalShareBp)),
    diagonalShareBp: medianOf(rows.map((row) => row.diagonalShareBp)),
    billedPerCut: medianOf(rows.map((row) => row.billedPerCut)),
    offRulePrices: rows.reduce((sum, row) => sum + row.offRulePrices, 0),
    collapses: medianOf(rows.map((row) => row.collapses)),
  }
}

function minutesToCoreOf(run: DigPolicyRun, planet: number): number | null {
  const pace = run.radius.planets.get(planet)
  if (pace?.coreTick == null) return null
  return (pace.coreTick - pace.arrivalTick) / TICKS_PER_MINUTE
}

/** Sales from arrival to the core over its minutes; null for a core never reached. */
function moneyPerMinuteOf(run: DigPolicyRun, planet: number): Money | null {
  const pace = run.radius.planets.get(planet)
  if (pace?.coreTick == null || pace.coreTick === pace.arrivalTick) return null
  const minutes = div(
    fromSafeInteger(pace.coreTick - pace.arrivalTick),
    fromSafeInteger(TICKS_PER_MINUTE),
  )
  return div(pace.salesToCore, minutes)
}

function shareProblems({ planet, diagonal }: DigPolicyComparison): string[] {
  const share = diagonal.diagonalShareBp
  if (share !== null && share >= DIAGONAL_HEAVY_BARS.diagonalShareBpMin) return []
  return [`P${planet}: the diagonal-heavy run cut ${bpText(share)} of its tunnel at 45°, under 50%`]
}

function minutesProblems({ planet, diagonal }: DigPolicyComparison): string[] {
  const { min, max } = DIAGONAL_HEAVY_BARS.planetMinutes
  const minutes = diagonal.minutes
  if (minutes !== null && minutes >= min && minutes <= max) return []
  return [
    `P${planet}: the diagonal-heavy run took ${minutesText(minutes)} to the core, outside 22-30`,
  ]
}

function moneyProblems({ planet, cardinal, diagonal }: DigPolicyComparison): string[] {
  const ratio = moneyRatioOf(diagonal.moneyPerMinute, cardinal.moneyPerMinute)
  const { min, max } = DIAGONAL_HEAVY_BARS.moneyPerMinuteRatio
  if (ratio !== null && ratio >= min && ratio <= max) return []
  return [
    `P${planet}: the diagonal-heavy run earns ${ratioText(ratio)} the cardinal money a minute`,
  ]
}

function casingProblems({ planet, diagonal }: DigPolicyComparison): string[] {
  const { min, max } = DIAGONAL_HEAVY_BARS.casingShareBp
  const share = diagonal.casingShareBp
  if (share !== null && share >= min && share <= max) return []
  return [
    `P${planet}: casing is ${bpText(share)} of the diagonal-heavy run's spend, outside 12%-20%`,
  ]
}

function arrivalProblems({ planet, diagonal }: DigPolicyComparison): string[] {
  if (planet < DIAGONAL_HEAVY_BARS.firstArrivalPlanet) return []
  const share = diagonal.arrivalShareBp
  if (share !== null && share <= DIAGONAL_HEAVY_BARS.arrivalShareBpMax) return []
  return [`P${planet}: the next grade costs ${bpText(share)} of the money held on arrival`]
}

function billingProblems({ planet, cardinal, diagonal }: DigPolicyComparison): string[] {
  const priced = [cardinal, diagonal].flatMap((row) =>
    row.offRulePrices === 0
      ? []
      : [`P${planet}: ${row.offRulePrices} rings priced off the per-metre rule`],
  )
  const ratio = numberRatioOf(diagonal.billedPerCut, cardinal.billedPerCut)
  const { min, max } = DIAGONAL_HEAVY_BARS.billedPerCutRatio
  if (ratio !== null && ratio >= min && ratio <= max) return priced
  return [
    ...priced,
    `P${planet}: the diagonal-heavy run's lining a metre cut is ${ratioText(ratio)} the cardinal's`,
  ]
}

function moneyRatioOf(a: Money | null, b: Money | null): number | null {
  if (a === null || b === null || cmp(b, fromSafeInteger(0)) <= 0) return null
  return ratioOf(a, b)
}

function numberRatioOf(a: number | null, b: number | null): number | null {
  return a === null || b === null || b === 0 ? null : a / b
}

function planetsToJudge(): number[] {
  return Array.from({ length: DIAGONAL_HEAVY_BARS.lastPlanet }, (_, index) => index + 1)
}

/** The middle value of the known ones; null when none is known. */
function medianOf(values: readonly (number | null)[]): number | null {
  const known = values.filter((value): value is number => value !== null).sort((a, b) => a - b)
  return known.length === 0 ? null : known[Math.floor((known.length - 1) / 2)]
}

function medianMoneyOf(values: readonly (Money | null)[]): Money | null {
  const known = values.filter((value): value is Money => value !== null).sort(cmp)
  return known.length === 0 ? null : known[Math.floor((known.length - 1) / 2)]
}

function planetText(row: DigPolicyPlanet): string {
  return [
    `${minutesText(row.minutes)} to the core`,
    `45° ${bpText(row.diagonalShareBp)} of the cut`,
    `casing ${bpText(row.casingShareBp)} of spend`,
    `next grade on arrival ${bpText(row.arrivalShareBp)} of money`,
    `lining ${row.billedPerCut === null ? 'n/a' : row.billedPerCut.toFixed(3)} m a metre cut`,
    `off-rule prices ${row.offRulePrices}`,
    `collapses ${row.collapses ?? 'n/a'}`,
  ].join(', ')
}

function bpText(bp: number | null): string {
  return bp === null ? 'n/a' : `${(bp / 100).toFixed(2)}%`
}

function minutesText(minutes: number | null): string {
  return minutes === null ? 'never' : `${minutes.toFixed(1)} min`
}

function ratioText(ratio: number | null): string {
  return ratio === null ? 'n/a' : `${ratio.toFixed(3)}x`
}
