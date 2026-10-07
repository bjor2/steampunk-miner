/**
 * Deaths per trip on planets 8 to 10, seed by seed (#198 acceptance, Systems' call on T9 #137),
 * derived from each run's events only: core minutes from arrival, trips, deaths and deaths per
 * trip, then the median of the seeds. Reported, never gated: a finding goes on the ticket, and
 * its levers are the bot's (#198 step 1), then P9's enemy volume (step 2), never the pace row.
 */
import { PACING_TARGETS } from '../constants/pacingTargets'
import { TICKS_PER_SECOND } from '../constants/physics'
import { derivePacingReport, type PacingReport } from './pacingReport'
import type { RunEvent } from './runEvent'

/** One seed's run as the report reads it. */
export interface SeededRunEvents {
  worldSeed: number
  events: readonly RunEvent[]
}

export interface AttritionRow {
  planet: number
  worldSeed: number
  /** Null when the run never completed this planet's core: a stall, or the budget ran out. */
  coreMinutes: number | null
  trips: number
  deaths: number
  deathsPerTrip: number
}

export interface AttritionMedian {
  planet: number
  coreMinutes: number | null
  deathsPerTrip: number
  worstDeathsPerTrip: number
}

const TICKS_PER_MINUTE = 60 * TICKS_PER_SECOND
const { attrition, campaignPlanetMinutes } = PACING_TARGETS

/** The attrition planets of #198, in order. */
export function attritionPlanets(): number[] {
  const { first, last } = attrition.planets
  return Array.from({ length: last - first + 1 }, (_, at) => first + at)
}

/** One row per planet and seed, planet by planet. */
export function attritionRows(runs: readonly SeededRunEvents[]): AttritionRow[] {
  const reports = runs.map((run) => ({
    run,
    pacing: derivePacingReport(run.events, run.worldSeed),
  }))
  return attritionPlanets().flatMap((planet) =>
    reports.map(({ run, pacing }) => attritionRowOf(run, pacing, planet)),
  )
}

export function attritionMedians(rows: readonly AttritionRow[]): AttritionMedian[] {
  return attritionPlanets().map((planet) =>
    medianOf(
      planet,
      rows.filter((row) => row.planet === planet),
    ),
  )
}

/** What misses #198's acceptance, one line each; empty when it all holds. */
export function attritionFindings(
  rows: readonly AttritionRow[],
  medians: readonly AttritionMedian[],
): string[] {
  return [
    ...rows.filter((row) => row.coreMinutes === null).map(stallFinding),
    ...rows.filter((row) => row.deathsPerTrip > attrition.seedDeathsPerTripMax).map(seedFinding),
    ...medians
      .filter((median) => median.deathsPerTrip > attrition.medianDeathsPerTripMax)
      .map(medianFinding),
    ...medians.filter(isCoreTimeMissed).map(coreTimeFinding),
  ]
}

/** The per-seed table and the medians, for the balance report. */
export function formatAttritionTables(
  rows: readonly AttritionRow[],
  medians: readonly AttritionMedian[],
): string {
  return [
    '| planet | seed | core | trips | deaths | deaths per trip |',
    '| --- | --- | --- | --- | --- | --- |',
    ...rows.map(
      (row) =>
        `| ${row.planet} | ${row.worldSeed} | ${minutesText(row.coreMinutes)} | ${row.trips} | ${row.deaths} | ${ratioText(row.deathsPerTrip)} |`,
    ),
    '',
    '| planet | median core | median deaths per trip | worst seed |',
    '| --- | --- | --- | --- |',
    ...medians.map(
      (median) =>
        `| ${median.planet} | ${minutesText(median.coreMinutes)} | ${ratioText(median.deathsPerTrip)} | ${ratioText(median.worstDeathsPerTrip)} |`,
    ),
  ].join('\n')
}

function attritionRowOf(run: SeededRunEvents, pacing: PacingReport, planet: number): AttritionRow {
  const coreTicks = pacing.coreTicksOnPlanet[String(planet)]
  const trips = pacing.tripsByPlanet[String(planet)] ?? 0
  const deaths = deathsOn(run.events, planet)
  return {
    planet,
    worldSeed: run.worldSeed,
    coreMinutes: coreTicks === undefined ? null : coreTicks / TICKS_PER_MINUTE,
    trips,
    deaths,
    deathsPerTrip: trips === 0 ? 0 : deaths / trips,
  }
}

function deathsOn(events: readonly RunEvent[], planet: number): number {
  return events.filter((event) => event.planet === planet && event.event === 'vehicle_destroyed')
    .length
}

function medianOf(planet: number, rows: readonly AttritionRow[]): AttritionMedian {
  const ratios = rows.map((row) => row.deathsPerTrip)
  return {
    planet,
    coreMinutes: middleOf(rows.map((row) => row.coreMinutes ?? Infinity)),
    deathsPerTrip: middleOf(ratios) ?? 0,
    worstDeathsPerTrip: Math.max(0, ...ratios),
  }
}

/** The middle sorted value, the later of two; a core never completed sorts last and reads null. */
function middleOf(values: readonly number[]): number | null {
  const middle = [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]
  return middle === undefined || middle === Infinity ? null : middle
}

/** P9 is a known short planet with a floor; P8 and P10 keep the campaign's 45 to 60 minutes. */
function isCoreTimeMissed(median: AttritionMedian): boolean {
  if (median.coreMinutes === null) return true
  if (median.planet === attrition.shortPlanet) {
    return median.coreMinutes < attrition.shortPlanetCoreMinutesMin
  }
  return (
    median.coreMinutes < campaignPlanetMinutes.min || median.coreMinutes > campaignPlanetMinutes.max
  )
}

function stallFinding(row: AttritionRow): string {
  return `seed ${row.worldSeed} never completed planet ${row.planet}'s core`
}

function seedFinding(row: AttritionRow): string {
  return `seed ${row.worldSeed} has ${ratioText(row.deathsPerTrip)} deaths per trip on planet ${row.planet}, above ${attrition.seedDeathsPerTripMax}`
}

function medianFinding(median: AttritionMedian): string {
  return `planet ${median.planet}'s median is ${ratioText(median.deathsPerTrip)} deaths per trip, above ${attrition.medianDeathsPerTripMax}`
}

function coreTimeFinding(median: AttritionMedian): string {
  return `planet ${median.planet}'s median core time ${minutesText(median.coreMinutes)} misses its target`
}

function minutesText(minutes: number | null): string {
  return minutes === null ? 'never' : `${minutes.toFixed(1)} min`
}

function ratioText(ratio: number): string {
  return ratio.toFixed(2)
}
