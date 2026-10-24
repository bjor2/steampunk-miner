/**
 * The per-seed rows of the "solar system 2" re-baseline (ticket 779): for each planet of system 2
 * the roster's draw (name, size class, surface start) and the economy rows' radius and ground
 * step beside the radius and ground step the world was generated with, then what the bot measured
 * there (minutes, felt speed, drill + tip majors, sales to the core). The lane prints them as a
 * table and writes them as NDJSON for the Tester's paired run; a gap between the rows and the
 * world is the kernel seam that does not bind a roster planet to generation yet.
 */
import { averageFeltOf, planetMinutesOf } from '../../logging/drillPace'
import { fromSafeInteger, toCanonical, toFixedText } from '../../systems/money'
import { groundHardnessInSystem, planetParamsAt } from '../../systems/starMap/systemPlanetParams'
import { planetEconomyRowOf, type PlanetEconomyRow } from './systems/economyRows'
import { rosterPlanetOf, type RosterPlanet } from './systems/systemRoster'
import {
  SYSTEM_TWO_PACE_BARS,
  SYSTEM_TWO_REBASELINE,
  systemTwoPlanetIndexes,
  type SystemTwoPaceRun,
} from './systemTwoPace'

/** One planet of system 2 in one seed's run. */
export interface SystemTwoPlanetRow {
  rebaseline: typeof SYSTEM_TWO_REBASELINE
  worldSeed: number
  place: number
  campaignIndex: number
  name: string
  sizeClass: string
  surface: string
  /** The economy rows' radius (system 1's at g times the size class) and the world's. */
  rowRadius: number
  worldRadius: number
  /** The economy rows' ground over system 1's at g, and the world's, as canonical text. */
  rowGroundStep: string
  worldGroundStep: string
  minutes: string | null
  feltAverage: string | null
  drillTipMajors: number | null
  soldToCore: string | null
}

const ONE = fromSafeInteger(1)
const FELT_PLACES = 2
const MINUTE_PLACES = 1

/** Every seed's rows, in seed then place order. */
export function systemTwoPlanetRowsOf(runs: readonly SystemTwoPaceRun[]): SystemTwoPlanetRow[] {
  return runs.flatMap((run) =>
    systemTwoPlanetIndexes().map((planetIndex, at) => planetRowOf(run, planetIndex, at + 1)),
  )
}

function planetRowOf(
  run: SystemTwoPaceRun,
  planetIndex: number,
  place: number,
): SystemTwoPlanetRow {
  const { system } = SYSTEM_TWO_PACE_BARS
  const roster = rosterPlanetOf(run.worldSeed, system, BigInt(place))
  const economy = planetEconomyRowOf(run.worldSeed, system, BigInt(place))
  const world = planetParamsAt(run.worldSeed, system, planetIndex)
  return {
    rebaseline: SYSTEM_TWO_REBASELINE,
    worldSeed: run.worldSeed,
    place,
    campaignIndex: planetIndex,
    ...drawOf(roster),
    ...plannedOf(economy),
    worldRadius: world.radiusTiles,
    worldGroundStep: toCanonical(groundHardnessInSystem(world, ONE)),
    ...measuredOf(run, planetIndex),
  }
}

function drawOf(roster: RosterPlanet) {
  return { name: roster.name, sizeClass: roster.sizeClass, surface: roster.surface }
}

function plannedOf(economy: PlanetEconomyRow) {
  return { rowRadius: economy.radiusTiles, rowGroundStep: toCanonical(economy.hardnessStep) }
}

function measuredOf(run: SystemTwoPaceRun, planetIndex: number) {
  const pace = run.drill.planets.get(planetIndex)
  const money = run.radius.planets.get(planetIndex)
  const minutes = pace === undefined ? null : planetMinutesOf(pace)
  return {
    minutes: minutes === null ? null : minutes.toFixed(MINUTE_PLACES),
    feltAverage: pace === undefined ? null : averageFeltOf(pace).toFixed(FELT_PLACES),
    drillTipMajors: pace?.drillTipMajors ?? null,
    soldToCore: money?.coreTick == null ? null : toFixedText(money.salesToCore, 0),
  }
}

/** The rows as a markdown table, headed with the re-baseline's name. */
export function systemTwoReportOf(rows: readonly SystemTwoPlanetRow[]): string {
  const header =
    '| seed | place | g | name | class | surface | radius rows / world | ground rows / world | ' +
    'minutes | felt avg | drill + tip | sold to core |'
  return [
    `Re-baseline "${SYSTEM_TWO_REBASELINE}" (ticket 779)`,
    header,
    ...rows.map(tableRowOf),
  ].join('\n')
}

function tableRowOf(row: SystemTwoPlanetRow): string {
  const cells = [
    row.worldSeed,
    row.place,
    row.campaignIndex,
    row.name,
    row.sizeClass,
    row.surface,
    `${row.rowRadius} / ${row.worldRadius}`,
    `${row.rowGroundStep} / ${row.worldGroundStep}`,
    row.minutes ?? 'never',
    row.feltAverage ?? '-',
    row.drillTipMajors ?? '-',
    row.soldToCore ?? 'never',
  ]
  return `| ${cells.join(' | ')} |`
}
