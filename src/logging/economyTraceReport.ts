/**
 * The economy trace's report (ticket 907): the run-comparison log the lane writes to
 * `balance-report/economy-trace.md` and #908 re-measures against. Per planet and kitPolicy hand,
 * the median of the pacing seeds (VS on #908: every row on the median of the 3 seeds); then
 * kitPolicy off against on; then each trip's sale by its deepest band, the seeds' trips pooled
 * (Progression's row: P2 on the `legacy` ore table against P3-P5 on `mixed`, #738); then every
 * seed's own rows. Reported, never gated: the finding goes on the ticket.
 */
import { fromCanonical, toFixedText, type Money } from '../systems/money'
import type { TripSale } from './economyTrace'
import {
  economyTraceRowsOf,
  medianMoneyOf,
  TICKS_PER_MINUTE,
  type EconomyTraceRow,
  type EconomyTraceRun,
  type KitHand,
} from './economyTraceRows'

export const KIT_HANDS: readonly KitHand[] = ['off', 'on']

/** One planet's medians over the seeds of one hand. */
export interface EconomyTraceMedians {
  planet: number
  hand: KitHand
  seeds: number
  minutes: number
  arrivalWallet: Money
  incomePerMinute: Money
  upgradesBought: number
  arrivalAskPrice: Money
  arrivalAskMinutes: number
  arrivalAsksCovered: number
  longestAskMinutes: number
  deaths: number
  /** Summed over the seeds, not their median: a cause one seed meets still shows. */
  deathsByCause: Record<string, number>
}

export function economyTraceMediansOf(
  rows: readonly EconomyTraceRow[],
  hand: KitHand,
): EconomyTraceMedians[] {
  const ofHand = rows.filter((row) => row.hand === hand)
  return planetsOf(ofHand).map((planet) =>
    mediansOfPlanet(
      planet,
      hand,
      ofHand.filter((row) => row.planet === planet),
    ),
  )
}

/** The lane's console lines: each hand's medians, one planet a line. */
export function economyTraceLinesOf(runs: readonly EconomyTraceRun[]): string[] {
  const rows = economyTraceRowsOf(runs)
  return KIT_HANDS.flatMap((hand) => economyTraceMediansOf(rows, hand).map(medianLineOf))
}

export function economyTraceMarkdownOf(runs: readonly EconomyTraceRun[], measuredOn: string) {
  const rows = economyTraceRowsOf(runs)
  return [
    `# P1-P5 economy trace (ticket 907), measured ${measuredOn}`,
    `Seeds ${seedsText(runs)}, the bot scenario to planet 5's core under kitPolicy off and on. ` +
      'Minutes run from arrival to the last step on the planet; income is every sale.',
    `## Medians of the seeds\n\n${mediansTableOf(rows)}`,
    `## kitPolicy off against on\n\n${comparisonTableOf(rows)}`,
    `## Sale per trip by deepest band, seeds pooled\n\n${bandTablesOf(runs)}`,
    `## Every seed\n\n${seedTableOf(rows)}`,
  ].join('\n\n')
}

function mediansOfPlanet(
  planet: number,
  hand: KitHand,
  rows: readonly EconomyTraceRow[],
): EconomyTraceMedians {
  const money = (pick: (row: EconomyTraceRow) => string) =>
    medianMoneyOf(rows.map((row) => fromCanonical(pick(row))))
  const count = (pick: (row: EconomyTraceRow) => number) => medianOf(rows.map(pick))
  return {
    planet,
    hand,
    seeds: rows.length,
    minutes: count((row) => row.ticks) / TICKS_PER_MINUTE,
    arrivalWallet: money((row) => row.arrivalWallet),
    incomePerMinute: money((row) => row.incomePerMinute),
    upgradesBought: count((row) => row.upgradesBought),
    arrivalAskPrice: money((row) => row.arrivalAsk.price),
    arrivalAskMinutes: count((row) => row.arrivalAsk.waitTicks) / TICKS_PER_MINUTE,
    arrivalAsksCovered: rows.filter((row) => row.arrivalAsk.isCovered).length,
    longestAskMinutes: count((row) => row.longestAskWaitTicks) / TICKS_PER_MINUTE,
    deaths: count((row) => row.deaths),
    deathsByCause: summedCounts(rows.map((row) => row.deathsByCause)),
  }
}

function medianLineOf(row: EconomyTraceMedians): string {
  return (
    `kit ${row.hand} P${row.planet}: ${row.minutes.toFixed(1)} min, arrived with ` +
    `${moneyText(row.arrivalWallet)}, ${moneyText(row.incomePerMinute)}/min, ` +
    `${row.upgradesBought} upgrades, next ${moneyText(row.arrivalAskPrice)} in ` +
    `${row.arrivalAskMinutes.toFixed(1)} min, deaths ${row.deaths} (${causesText(row.deathsByCause)})`
  )
}

function mediansTableOf(rows: readonly EconomyTraceRow[]): string {
  const header = [
    '| kit | planet | seeds | minutes | money on arrival | income/min | upgrades | next upgrade on arrival | covered | longest wait | deaths | deaths by cause (all seeds) |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
  ]
  const lines = KIT_HANDS.flatMap((hand) =>
    economyTraceMediansOf(rows, hand).map(
      (row) =>
        `| ${hand} | P${row.planet} | ${row.seeds} | ${row.minutes.toFixed(1)} | ` +
        `${moneyText(row.arrivalWallet)} | ${moneyText(row.incomePerMinute)} | ` +
        `${row.upgradesBought} | ${moneyText(row.arrivalAskPrice)} in ` +
        `${row.arrivalAskMinutes.toFixed(1)} min | ${row.arrivalAsksCovered}/${row.seeds} | ` +
        `${row.longestAskMinutes.toFixed(1)} min | ${row.deaths} | ${causesText(row.deathsByCause)} |`,
    ),
  )
  return [...header, ...lines].join('\n')
}

function comparisonTableOf(rows: readonly EconomyTraceRow[]): string {
  const off = economyTraceMediansOf(rows, 'off')
  const on = economyTraceMediansOf(rows, 'on')
  const header = [
    '| planet | minutes off / on | income/min off / on | upgrades off / on | deaths off / on |',
    '| --- | --- | --- | --- | --- |',
  ]
  const lines = off.map((bare) =>
    comparisonLineOf(
      bare,
      on.find((kit) => kit.planet === bare.planet),
    ),
  )
  return [...header, ...lines].join('\n')
}

function comparisonLineOf(off: EconomyTraceMedians, on: EconomyTraceMedians | undefined): string {
  const pair = (left: string, right: (row: EconomyTraceMedians) => string) =>
    `${left} / ${on === undefined ? 'n/a' : right(on)}`
  return (
    `| P${off.planet} | ${pair(off.minutes.toFixed(1), (row) => row.minutes.toFixed(1))} | ` +
    `${pair(moneyText(off.incomePerMinute), (row) => moneyText(row.incomePerMinute))} | ` +
    `${pair(`${off.upgradesBought}`, (row) => `${row.upgradesBought}`)} | ` +
    `${pair(`${off.deaths}`, (row) => `${row.deaths}`)} |`
  )
}

function bandTablesOf(runs: readonly EconomyTraceRun[]): string {
  return KIT_HANDS.map(
    (hand) =>
      `kitPolicy ${hand}: the middle trip's sale (trips, rescued)\n\n` +
      bandTableOf(runs.filter((run) => run.hand === hand)),
  ).join('\n\n')
}

/** One row per band, one column per planet, the hand's seeds pooled. */
function bandTableOf(runs: readonly EconomyTraceRun[]): string {
  const planets = sortedNumbers(runs.flatMap((run) => [...run.trace.planets.keys()]))
  const tripsByPlanet = planets.map((planet) => tripsOnPlanet(runs, planet))
  const bands = sortedNumbers(tripsByPlanet.flat().map((trip) => trip.band))
  const header = [
    `| band | ${planets.map((planet) => `P${planet}`).join(' | ')} |`,
    `| --- | ${planets.map(() => '---').join(' | ')} |`,
  ]
  const lines = bands.map((band) => bandLineOf(band, tripsByPlanet))
  return [...header, ...lines].join('\n')
}

function tripsOnPlanet(runs: readonly EconomyTraceRun[], planet: number): TripSale[] {
  return runs.flatMap((run) => run.trace.planets.get(planet)?.trips ?? [])
}

function bandLineOf(band: number, tripsByPlanet: readonly TripSale[][]): string {
  return `| ${band} | ${tripsByPlanet.map((trips) => bandCellOf(trips, band)).join(' | ')} |`
}

function bandCellOf(trips: readonly TripSale[], band: number): string {
  const inBand = trips.filter((trip) => trip.band === band)
  if (inBand.length === 0) return '-'
  const rescued = inBand.filter((trip) => trip.isRescued).length
  const median = medianMoneyOf(inBand.map((trip) => trip.value))
  return `${moneyText(median)} (${inBand.length}, ${rescued})`
}

function seedTableOf(rows: readonly EconomyTraceRow[]): string {
  const header = [
    '| seed | kit | planet | minutes | money on arrival | income/min | upgrades bought | next upgrade on arrival | deaths by cause |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- |',
  ]
  return [...header, ...rows.map(seedLineOf)].join('\n')
}

function seedLineOf(row: EconomyTraceRow): string {
  const ask = row.arrivalAsk
  const wait = `${(ask.waitTicks / TICKS_PER_MINUTE).toFixed(1)} min${ask.isCovered ? '' : ', never covered'}`
  return (
    `| ${row.worldSeed} | ${row.hand} | P${row.planet} | ${(row.ticks / TICKS_PER_MINUTE).toFixed(1)} | ` +
    `${moneyText(fromCanonical(row.arrivalWallet))} | ${moneyText(fromCanonical(row.incomePerMinute))} | ` +
    `${countsText(row.upgrades)} | ${ask.upgradeId} ${moneyText(fromCanonical(ask.price))} (${wait}) | ` +
    `${causesText(row.deathsByCause)} |`
  )
}

function planetsOf(rows: readonly EconomyTraceRow[]): number[] {
  return sortedNumbers(rows.map((row) => row.planet))
}

/** The distinct values, lowest first. */
function sortedNumbers(values: readonly number[]): number[] {
  return [...new Set(values)].sort((a, b) => a - b)
}

function seedsText(runs: readonly EconomyTraceRun[]): string {
  return [...new Set(runs.map((run) => run.worldSeed))].join(', ')
}

function summedCounts(counts: readonly Record<string, number>[]): Record<string, number> {
  const total: Record<string, number> = {}
  counts.flatMap(Object.entries).forEach(([key, count]) => {
    total[key] = (total[key] ?? 0) + count
  })
  return total
}

function causesText(counts: Record<string, number>): string {
  return Object.keys(counts).length === 0 ? 'none' : countsText(counts)
}

function countsText(counts: Record<string, number>): string {
  const entries = Object.entries(counts).sort(([a], [b]) => a.localeCompare(b))
  return entries.length === 0 ? 'none' : entries.map(([key, count]) => `${key} ${count}`).join(', ')
}

function moneyText(amount: Money): string {
  return `$${toFixedText(amount, 0)}`
}

/** The lower middle of a list that is never empty. */
function medianOf(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor((sorted.length - 1) / 2)]
}
