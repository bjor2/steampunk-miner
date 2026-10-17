/**
 * Ticket 449's share table, the document the status page prints (`docs/economy/rarity-shares.json`,
 * written by `npm run rarity:shares`): per judged planet and band, the worst over the pacing seeds
 * of every share the bounds read, each bound beside it, the bounds a reading misses, and the #385
 * income cap at the on-curve vehicle with the rarity-weighted share beside the nominal one
 * (Systems 6203159815: "so nothing is hidden"). Pure: readings in, a JSON-ready document out.
 */
import { PACING_WORLD_SEEDS } from '../../../constants/pacingSeeds'
import {
  isFailingIncomeCap,
  onCurveIncomeCapVerdictsOf,
  type IncomeCapVerdict,
} from '../../tech-tree'
import { planetReadingOf, type BandReading, type PlanetReading } from './planetShares'
import { SHARE_ROWS, type ShareRows } from './shareRows'
import { shareViolationsOf, violationTextOf } from './shareVerdicts'

export const SHARE_TABLE_SCHEMA = 1
/** Where `npm run rarity:shares` writes the table, from the repository root; the page reads it. */
export const RARITY_SHARES_DOC = 'docs/economy/rarity-shares.json'

export interface ShareTableBand {
  band: number
  /** Non-common tiers and the signature on Systems' model (base signature share). */
  tiersBp: Readonly<Record<string, number>>
  /** The same on the mix play draws, only where a story planet boosts the signature. */
  boostedTiersBp?: Readonly<Record<string, number>>
  epicAndMythicBp: number
  /** null on a planet without a roster. */
  worstCommonKindBp: number | null
  worstOtherKindBp: number | null
  fewestLiveCommons: number | null
  /** Band mean per ore unit against today's, basis points to two places, largest either way. */
  meanShiftBp: string
  boostedMeanShiftBp?: string
  cvBp: number
  p999OfExpectedBp: number
  worstEpicAndMythicTripBp: number
  clampLossBp: string
}

export interface ShareTablePlanet {
  planet: number
  hold: number
  hasRoster: boolean
  isSignatureBoosted: boolean
  bands: readonly ShareTableBand[]
  worstCommonKindOfPlanetBp: number | null
  worstOtherKindOfPlanetBp: number | null
  /** Every bound a seed's reading misses, one line each; empty when the planet holds them all. */
  violations: readonly string[]
}

export interface IncomeCapTableRow {
  planet: number
  item: string
  /** After the trip cap, over the rarity-weighted full hold: the share the gate reads. */
  shareBp: number
  nominalShareBp: number
  unclampedBp: number
  isFailing: boolean
}

export interface ShareTable {
  schema: number
  ticket: number
  seeds: readonly number[]
  bounds: ShareRows['bounds'] & ShareRows['trip'] & { liveCommonsPerBandMin: number }
  planets: readonly ShareTablePlanet[]
  /** Band 5 on arrival, the on-curve vehicle with every income item owned. */
  incomeCap: readonly IncomeCapTableRow[]
}

const TICKET = 449
const INCOME_CAP_BAND = 5

/** The pacing seeds: the seed set Systems' asserts run over (#84's median seeds). */
export const SHARE_TABLE_SEEDS: readonly number[] = PACING_WORLD_SEEDS['bot-slice']

/** The table of this build: every judged planet on every seed, and the on-curve income cap. */
export function currentShareTable(rows: ShareRows = SHARE_ROWS): ShareTable {
  return shareTableOf(judgedReadingsOf(SHARE_TABLE_SEEDS, rows), onCurveIncomeCapVerdictsOf(), rows)
}

/** Each judged planet read on each seed, planet by planet. */
export function judgedReadingsOf(
  seeds: readonly number[],
  rows: ShareRows = SHARE_ROWS,
): PlanetReading[] {
  return rows.judgedPlanets.flatMap((planet) =>
    seeds.map((seed) => planetReadingOf(seed, planet, rows)),
  )
}

/** The table from each judged planet's readings on every seed, and the on-curve income cap. */
export function shareTableOf(
  readings: readonly PlanetReading[],
  incomeCap: readonly IncomeCapVerdict[],
  rows: ShareRows,
): ShareTable {
  return {
    schema: SHARE_TABLE_SCHEMA,
    ticket: TICKET,
    seeds: [...new Set(readings.map((reading) => reading.worldSeed))],
    bounds: { ...rows.bounds, ...rows.trip, liveCommonsPerBandMin: rows.liveCommonsPerBandMin },
    planets: rows.judgedPlanets.map((planet) =>
      planetRowOf(
        readings.filter((reading) => reading.planetIndex === planet),
        rows,
      ),
    ),
    incomeCap: incomeCap.filter(isBandFiveArrival).map(incomeCapRowOf),
  }
}

function planetRowOf(readings: readonly PlanetReading[], rows: ShareRows): ShareTablePlanet {
  const [first] = readings
  const kinds = readings.flatMap((reading) => reading.planetKinds)
  return {
    planet: first.planetIndex,
    hold: first.hold,
    hasRoster: first.hasRoster,
    isSignatureBoosted: first.isSignatureBoosted,
    bands: first.bands.map((_, at) =>
      bandRowOf(
        readings.map((reading) => reading.bands[at]),
        first.isSignatureBoosted,
      ),
    ),
    worstCommonKindOfPlanetBp: worstOrNull(kinds.filter((k) => k.isCommon).map((k) => k.planetBp)),
    worstOtherKindOfPlanetBp: worstOrNull(kinds.filter((k) => !k.isCommon).map((k) => k.planetBp)),
    violations: readings.flatMap((reading) =>
      shareViolationsOf(reading, rows).map(violationTextOf),
    ),
  }
}

function bandRowOf(bands: readonly BandReading[], isSignatureBoosted: boolean): ShareTableBand {
  const kinds = bands.flatMap((band) => band.shares.kinds)
  const row: ShareTableBand = {
    band: bands[0].band,
    tiersBp: worstTiersOf(bands.map((band) => band.shares.tiers)),
    epicAndMythicBp: worstOf(bands.map((band) => band.shares.epicAndMythicBp)),
    worstCommonKindBp: worstOrNull(kinds.filter((k) => k.isCommon).map((k) => k.bandTripBp)),
    worstOtherKindBp: worstOrNull(kinds.filter((k) => !k.isCommon).map((k) => k.bandTripBp)),
    fewestLiveCommons:
      kinds.length === 0 ? null : Math.min(...bands.map((b) => b.shares.liveCommons)),
    meanShiftBp: furthestText(bands.map((band) => band.meanShiftBp)),
    cvBp: worstOf(bands.map((band) => band.trip.cvBp)),
    p999OfExpectedBp: worstOf(bands.map((band) => band.trip.p999OfExpectedBp)),
    worstEpicAndMythicTripBp: worstOf(bands.map((band) => band.trip.worstEpicAndMythicBp)),
    clampLossBp: worstOf(bands.map((band) => band.trip.clampLossBp)).toFixed(2),
  }
  if (!isSignatureBoosted) return row
  return {
    ...row,
    boostedTiersBp: worstTiersOf(bands.map((band) => band.realTiers)),
    boostedMeanShiftBp: furthestText(bands.map((band) => band.realMeanShiftBp)),
  }
}

function worstTiersOf(tierLists: readonly BandReading['realTiers'][]): Record<string, number> {
  const worst: Record<string, number> = {}
  for (const tier of tierLists.flat()) {
    worst[tier.tierId] = Math.max(worst[tier.tierId] ?? 0, tier.bandTripBp)
  }
  return worst
}

function worstOf(values: readonly number[]): number {
  return values.reduce((worst, value) => Math.max(worst, value), 0)
}

function worstOrNull(values: readonly number[]): number | null {
  return values.length === 0 ? null : worstOf(values)
}

/** The value furthest from zero, to two places. */
function furthestText(values: readonly number[]): string {
  const furthest = values.reduce(
    (kept, value) => (Math.abs(value) > Math.abs(kept) ? value : kept),
    0,
  )
  const text = furthest.toFixed(2)
  return text === '-0.00' ? '0.00' : text
}

function isBandFiveArrival(verdict: IncomeCapVerdict): boolean {
  return verdict.band === INCOME_CAP_BAND && verdict.visit === 'arrival'
}

function incomeCapRowOf(verdict: IncomeCapVerdict): IncomeCapTableRow {
  return {
    planet: verdict.planetIndex,
    item: verdict.itemId,
    shareBp: verdict.medianShareBp,
    nominalShareBp: verdict.medianNominalShareBp,
    unclampedBp: verdict.medianUnclampedBp,
    isFailing: isFailingIncomeCap(verdict),
  }
}
