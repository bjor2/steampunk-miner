/**
 * The per-trip fold's rows and summary (ticket 918), written beside the economy trace so the
 * Tester's six P1-P5 runs carry them into #916's report and #908's trip gate (6-15 trips a planet,
 * median trip at most 5 min, none over 8 min; `voluntary_sell` and `cache_crate` endings don't count
 * toward the 6-trip floor). One NDJSON row per trip, then per seed, hand and planet: the trips home
 * (a crate drop is not one), those toward the floor, the median and longest trip home, and every
 * cause. Reported, never gated here: #908 owns the gate.
 */
import { toCanonical } from '../systems/money'
import { TRIP_END_CAUSES, type TripEndCause } from './tripEndCause'
import type { TripRecord } from './tripFold'
import { TICKS_PER_MINUTE, type EconomyTraceRun, type KitHand } from './economyTraceRows'

export interface TripRow {
  worldSeed: number
  hand: KitHand
  planet: number
  startTick: number
  endTick: number
  ticks: number
  endCause: TripEndCause
  deepestBand: number
  cellsCut: number
  sellValue: string
  fuelUsedQuanta: number
}

/** Endings that are not a trip home: the hold went into a crate and the rig mined on. */
const NOT_HOME: readonly TripEndCause[] = ['cache_crate']
/** Endings #908's 6-trip floor does not count. */
const NOT_TOWARD_FLOOR: readonly TripEndCause[] = ['voluntary_sell', 'cache_crate']

export function tripRowsOf(runs: readonly EconomyTraceRun[]): TripRow[] {
  return runs.flatMap((run) => run.trips.trips.map((trip) => tripRowOf(run, trip)))
}

function tripRowOf(run: EconomyTraceRun, trip: TripRecord): TripRow {
  return {
    worldSeed: run.worldSeed,
    hand: run.hand,
    planet: trip.planet,
    startTick: trip.startTick,
    endTick: trip.endTick,
    ticks: trip.endTick - trip.startTick,
    endCause: trip.endCause,
    deepestBand: trip.deepestBand,
    cellsCut: trip.cellsCut,
    sellValue: toCanonical(trip.sellValue),
    fuelUsedQuanta: trip.fuelUsedQuanta,
  }
}

/** Every seed's trips by hand and planet, one table row each. */
export function tripMarkdownOf(rows: readonly TripRow[], measuredOn: string): string {
  return [
    `# P1-P5 trips (ticket 918), measured ${measuredOn}`,
    'Minutes run from the first step off the pad to the dock, rescue or crate drop that ended ' +
      'the trip. Trips home leave out crate drops; toward the floor also leaves out voluntary sells.',
    tripTableOf(rows),
  ].join('\n\n')
}

function tripTableOf(rows: readonly TripRow[]): string {
  const header = [
    '| hand | seed | planet | trips home | toward the floor | median min | longest min | causes |',
    '|---|---|---|---|---|---|---|---|',
  ]
  return [...header, ...groupsOf(rows).map(tripGroupLineOf)].join('\n')
}

/** The rows of one seed, hand and planet, in the order they were played. */
function groupsOf(rows: readonly TripRow[]): TripRow[][] {
  const groups = new Map<string, TripRow[]>()
  rows.forEach((row) => {
    const key = `${row.hand}|${row.worldSeed}|${row.planet}`
    groups.set(key, [...(groups.get(key) ?? []), row])
  })
  return [...groups.values()]
}

function tripGroupLineOf(group: readonly TripRow[]): string {
  const [{ hand, worldSeed, planet }] = group
  const home = group.filter((row) => !NOT_HOME.includes(row.endCause))
  const towardFloor = home.filter((row) => !NOT_TOWARD_FLOOR.includes(row.endCause))
  const minutes = home.map((row) => row.ticks / TICKS_PER_MINUTE)
  const cells = [hand, worldSeed, planet, home.length, towardFloor.length]
  return `| ${[...cells, medianText(minutes), longestText(minutes), causesText(group)].join(' | ')} |`
}

function medianText(minutes: readonly number[]): string {
  if (minutes.length === 0) return '-'
  const sorted = [...minutes].sort((a, b) => a - b)
  return sorted[Math.floor((sorted.length - 1) / 2)].toFixed(1)
}

function longestText(minutes: readonly number[]): string {
  return minutes.length === 0 ? '-' : Math.max(...minutes).toFixed(1)
}

function causesText(group: readonly TripRow[]): string {
  return TRIP_END_CAUSES.map((cause) => [cause, countOf(group, cause)] as const)
    .filter(([, count]) => count > 0)
    .map(([cause, count]) => `${cause} ${count}`)
    .join(', ')
}

function countOf(group: readonly TripRow[], cause: TripEndCause): number {
  return group.filter((row) => row.endCause === cause).length
}
