/**
 * The bot's gate clears judged across the pacing seeds, as `balance:charges` prints them (GD lock
 * on #148, ticket 237 and its GD ruling of 7 Oct):
 *
 * - Dynamite clears: the hard bar, a median of 1.5 or more a run, worked out per planet over only
 *   the seeds whose generated planet has dynamite-gated cells. A planet is judged when at least 2
 *   seeds have such cells; with 1 it is an insufficient sample, printed and passed; with none it
 *   reads n/a. At least 4 planets must be judged, one of them from planet 28 on. The (planet,
 *   seed) pairs with no cells print as data for Systems; a dynamite act with none on any seed is
 *   `dynamiteDryRuns.ts`'s content finding, over every planet of the dynamite acts.
 * - Dynamite payback: the freed cells' value over the price of the charges that freed them (#143
 *   guard 2, moved from K8 #218), reported beside the clears and never a bar. A seed whose bot
 *   blasted no gated cell has no payback and sits out of that median.
 * - Extractor clears: the bar of 148d (#296), a median of 1.5 or more a run on every planet the
 *   table reads, now that the bot buys each extractor on its planet.
 */
import { add, cmp, div, fromSafeInteger, toCanonical, type Money } from '../systems/money'
import { dynamitePaybackOf, gateClearsOn, type PlanetGateClears } from './gateClearTally'

export const DYNAMITE_CLEAR_FLOOR = 1.5
/** #143 guard 2's figure, printed beside the clears for information. */
export const DYNAMITE_PAYBACK_FIGURE = 2
/** 148d's bar (#296): extractor-gated cells the bot freed a run, median over the seeds. */
export const EXTRACTOR_CLEAR_FLOOR = 1.5
/** The GD ruling's coverage: judged planets, and the planet one of them must be at or past. */
export const MIN_JUDGED_PLANETS = 4
export const LATE_JUDGED_PLANET = 28
const MIN_SEEDS_WITH_CELLS = 2

/** A planet's dynamite-gated tiles per seed. */
export interface DynamiteCensus {
  planet: number
  tilesBySeed: readonly number[]
}

export type DynamiteJudgement = 'judged' | 'insufficient sample' | 'no dynamite cells'

export interface GateClearRow {
  planet: number
  dynamiteTilesBySeed: readonly number[]
  judgement: DynamiteJudgement
  /** Null on a seed with no dynamite cells: it sits out of the median. */
  dynamiteBySeed: (number | null)[]
  dynamiteMedian: number | null
  paybackBySeed: (Money | null)[]
  paybackMedian: Money | null
  extractorBySeed: number[]
  extractorMedian: number | null
}

/** One row per censused planet, from each seed's tally in seed order. */
export function gateClearRowsOf(
  bySeed: readonly ReadonlyMap<number, PlanetGateClears>[],
  census: readonly DynamiteCensus[],
): GateClearRow[] {
  return census.map((planet) => gateClearRowOf(bySeed, planet))
}

export function dynamiteTableOf(rows: readonly GateClearRow[], seeds: readonly number[]): string {
  return [
    `| planet | ${seeds.map((seed) => `cells ${seed}`).join(' | ')} | ${seeds.join(' | ')} | median | judged | at least ${DYNAMITE_CLEAR_FLOOR} | ${seeds.map((seed) => `payback ${seed}`).join(' | ')} | median payback (report) |`,
    `| --- | ${seeds.map(() => '---').join(' | ')} | ${seeds.map(() => '---').join(' | ')} | --- | --- | --- | ${seeds.map(() => '---').join(' | ')} | --- |`,
    ...rows.map(
      (row) =>
        `| ${row.planet} | ${row.dynamiteTilesBySeed.join(' | ')} | ${row.dynamiteBySeed.map(clearsText).join(' | ')} | ${clearsText(row.dynamiteMedian)} | ${row.judgement} | ${dynamiteVerdictOf(row)} | ${row.paybackBySeed.map(paybackText).join(' | ')} | ${paybackText(row.paybackMedian)} |`,
    ),
  ].join('\n')
}

export function extractorTableOf(rows: readonly GateClearRow[], seeds: readonly number[]): string {
  return [
    `| planet | ${seeds.join(' | ')} | median | at least ${EXTRACTOR_CLEAR_FLOOR} |`,
    `| --- | ${seeds.map(() => '---').join(' | ')} | --- | --- |`,
    ...rows.map(
      (row) =>
        `| ${row.planet} | ${row.extractorBySeed.join(' | ')} | ${clearsText(row.extractorMedian)} | ${isExtractorUnderTheBar(row) ? 'no' : 'yes'} |`,
    ),
  ].join('\n')
}

/** The (planet, seed) pairs with no dynamite cells, as data for Systems (GD ruling on #237 Q3). */
export function pairsWithoutDynamiteText(
  rows: readonly GateClearRow[],
  seeds: readonly number[],
): string {
  const pairs = rows.flatMap((row) =>
    seedsWithoutCellsOf(row, seeds).map((seed) => `(${row.planet}, ${seed})`),
  )
  return pairs.length === 0 ? 'none' : pairs.join(', ')
}

/** Every judged median under its bar, dynamite and extractor, and a short coverage, one each. */
export function gateClearWarnings(rows: readonly GateClearRow[]): string[] {
  return [
    ...rows.filter(isUnderTheBar).map(underTheBarLine),
    ...rows.filter(isExtractorUnderTheBar).map(extractorUnderTheBarLine),
    ...coverageWarnings(rows),
  ]
}

function gateClearRowOf(
  bySeed: readonly ReadonlyMap<number, PlanetGateClears>[],
  census: DynamiteCensus,
): GateClearRow {
  const seeds = bySeed.map((byPlanet) => gateClearsOn(byPlanet, census.planet))
  const hasCells = census.tilesBySeed.map((tiles) => tiles > 0)
  const dynamiteBySeed = seeds.map((clears, at) => (hasCells[at] ? clears.dynamiteClears : null))
  const paybackBySeed = seeds.map((clears, at) => (hasCells[at] ? dynamitePaybackOf(clears) : null))
  const extractorBySeed = seeds.map((clears) => clears.extractorClears)
  return {
    planet: census.planet,
    dynamiteTilesBySeed: census.tilesBySeed,
    judgement: judgementOf(hasCells.filter(Boolean).length),
    dynamiteBySeed,
    dynamiteMedian: medianOf(dynamiteBySeed.filter((clears) => clears !== null)),
    paybackBySeed,
    paybackMedian: medianMoneyOf(paybackBySeed),
    extractorBySeed,
    extractorMedian: medianOf(extractorBySeed),
  }
}

function seedsWithoutCellsOf(row: GateClearRow, seeds: readonly number[]): number[] {
  return seeds.filter((_seed, at) => row.dynamiteTilesBySeed[at] === 0)
}

function judgementOf(seedsWithCells: number): DynamiteJudgement {
  if (seedsWithCells >= MIN_SEEDS_WITH_CELLS) return 'judged'
  return seedsWithCells === 0 ? 'no dynamite cells' : 'insufficient sample'
}

function dynamiteVerdictOf(row: GateClearRow): string {
  if (row.judgement !== 'judged') return 'n/a'
  return isUnderTheBar(row) ? 'no' : 'yes'
}

function isUnderTheBar(row: GateClearRow): boolean {
  return row.judgement === 'judged' && (row.dynamiteMedian ?? 0) < DYNAMITE_CLEAR_FLOOR
}

function underTheBarLine(row: GateClearRow): string {
  return `planet ${row.planet}: the bot freed a median of ${clearsText(row.dynamiteMedian)} shells a run over the seeds with dynamite cells`
}

function isExtractorUnderTheBar(row: GateClearRow): boolean {
  return (row.extractorMedian ?? 0) < EXTRACTOR_CLEAR_FLOOR
}

function extractorUnderTheBarLine(row: GateClearRow): string {
  return `planet ${row.planet}: the bot freed a median of ${clearsText(row.extractorMedian)} extractor-gated cells a run`
}

function coverageWarnings(rows: readonly GateClearRow[]): string[] {
  const judged = rows.filter((row) => row.judgement === 'judged').map((row) => row.planet)
  return [
    ...(judged.length < MIN_JUDGED_PLANETS
      ? [`only ${judged.length} planets judged for dynamite (${MIN_JUDGED_PLANETS} wanted)`]
      : []),
    ...(judged.some((planet) => planet >= LATE_JUDGED_PLANET)
      ? []
      : [`no planet from ${LATE_JUDGED_PLANET} on judged for dynamite`]),
  ]
}

function medianOf(values: readonly number[]): number | null {
  if (values.length === 0) return null
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

function clearsText(clears: number | null): string {
  return clears === null ? 'n/a' : String(clears)
}

/** Two places, as the report prints its multiples; a report line, never a rule. */
function paybackText(payback: Money | null): string {
  return payback === null ? '-' : `${Number(toCanonical(payback)).toFixed(2)}x`
}
