/**
 * The bot's gate clears judged across the pacing seeds, as `balance:charges` prints them (GD lock
 * on #148, ticket 237): per judged planet, each seed's dynamite clears and their median (wanted at
 * 1.5 or more a run), each seed's dynamite payback and its median (wanted at 2x or more: #143 guard
 * 2, moved here from K8 #218), and each seed's extractor clears and their median (wanted at 1.5 or
 * more). A seed whose bot blasted no gated cell has no payback and sits out of that median.
 */
import { add, cmp, div, fromSafeInteger, toCanonical, type Money } from '../systems/money'
import { dynamitePaybackOf, gateClearsOn, type PlanetGateClears } from './gateClearTally'

export const DYNAMITE_CLEAR_FLOOR = 1.5
export const DYNAMITE_PAYBACK_FLOOR = 2
export const EXTRACTOR_CLEAR_FLOOR = 1.5

export interface GateClearRow {
  planet: number
  dynamiteBySeed: number[]
  dynamiteMedian: number
  paybackBySeed: (Money | null)[]
  paybackMedian: Money | null
  extractorBySeed: number[]
  extractorMedian: number
}

/** One row per planet, from each seed's tally in seed order. */
export function gateClearRowsOf(
  bySeed: readonly ReadonlyMap<number, PlanetGateClears>[],
  planets: readonly number[],
): GateClearRow[] {
  return planets.map((planet) => gateClearRowOf(bySeed, planet))
}

export function dynamiteTableOf(rows: readonly GateClearRow[], seeds: readonly number[]): string {
  return [
    `| planet | ${seeds.join(' | ')} | median | at least ${DYNAMITE_CLEAR_FLOOR} | ${seeds.map((seed) => `payback ${seed}`).join(' | ')} | median payback | at least ${DYNAMITE_PAYBACK_FLOOR}x |`,
    `| --- | ${seeds.map(() => '---').join(' | ')} | --- | --- | ${seeds.map(() => '---').join(' | ')} | --- | --- |`,
    ...rows.map(
      (row) =>
        `| ${row.planet} | ${row.dynamiteBySeed.join(' | ')} | ${row.dynamiteMedian} | ${yesNo(row.dynamiteMedian >= DYNAMITE_CLEAR_FLOOR)} | ${row.paybackBySeed.map(paybackText).join(' | ')} | ${paybackText(row.paybackMedian)} | ${yesNo(isPaybackMet(row.paybackMedian))} |`,
    ),
  ].join('\n')
}

export function extractorTableOf(rows: readonly GateClearRow[], seeds: readonly number[]): string {
  return [
    `| planet | ${seeds.join(' | ')} | median | at least ${EXTRACTOR_CLEAR_FLOOR} |`,
    `| --- | ${seeds.map(() => '---').join(' | ')} | --- | --- |`,
    ...rows.map(
      (row) =>
        `| ${row.planet} | ${row.extractorBySeed.join(' | ')} | ${row.extractorMedian} | ${yesNo(row.extractorMedian >= EXTRACTOR_CLEAR_FLOOR)} |`,
    ),
  ].join('\n')
}

/** Every median under its floor, one line each. */
export function gateClearWarnings(rows: readonly GateClearRow[]): string[] {
  return rows.flatMap((row) => [
    ...(row.dynamiteMedian < DYNAMITE_CLEAR_FLOOR
      ? [`planet ${row.planet}: the bot freed a median of ${row.dynamiteMedian} shells a run`]
      : []),
    ...(isPaybackMet(row.paybackMedian)
      ? []
      : [`planet ${row.planet}: dynamite paid back ${paybackText(row.paybackMedian)} (median)`]),
    ...(row.extractorMedian < EXTRACTOR_CLEAR_FLOOR
      ? [
          `planet ${row.planet}: the bot freed a median of ${row.extractorMedian} extractor cells a run`,
        ]
      : []),
  ])
}

export function isPaybackMet(payback: Money | null): boolean {
  return payback !== null && cmp(payback, fromSafeInteger(DYNAMITE_PAYBACK_FLOOR)) >= 0
}

function gateClearRowOf(
  bySeed: readonly ReadonlyMap<number, PlanetGateClears>[],
  planet: number,
): GateClearRow {
  const seeds = bySeed.map((byPlanet) => gateClearsOn(byPlanet, planet))
  const dynamiteBySeed = seeds.map((clears) => clears.dynamiteClears)
  const paybackBySeed = seeds.map(dynamitePaybackOf)
  const extractorBySeed = seeds.map((clears) => clears.extractorClears)
  return {
    planet,
    dynamiteBySeed,
    dynamiteMedian: medianOf(dynamiteBySeed),
    paybackBySeed,
    paybackMedian: medianMoneyOf(paybackBySeed),
    extractorBySeed,
    extractorMedian: medianOf(extractorBySeed),
  }
}

function medianOf(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

function medianMoneyOf(values: readonly (Money | null)[]): Money | null {
  const sorted = values.filter((value): value is Money => value !== null).sort(cmp)
  if (sorted.length === 0) return null
  const middle = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 1) return sorted[middle]
  return div(add(sorted[middle - 1], sorted[middle]), fromSafeInteger(2))
}

/** Two places, as the report prints its multiples; a report line, never a rule. */
function paybackText(payback: Money | null): string {
  return payback === null ? '-' : `${Number(toCanonical(payback)).toFixed(2)}x`
}

function yesNo(isMet: boolean): string {
  return isMet ? 'yes' : 'no'
}
