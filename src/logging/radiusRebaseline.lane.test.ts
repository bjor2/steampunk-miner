import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { beforeAll, describe, expect, it } from 'vitest'
import { PACING_WORLD_SEEDS } from '../constants/pacingSeeds'
import { TICKS_PER_SECOND } from '../constants/physics'
import type { CommandIntent } from '../systems/authority/authorityCommand'
import { createAuthorityState } from '../systems/authority/authorityState'
import { createBotSession } from '../systems/bot/botSession'
import { botPlanetOf } from '../systems/bot/botTravel'
import { playSliceFrom } from '../systems/bot/playSlice'
import { toFixedText } from '../systems/money'
import { startOfScenario, validateScenario, type Scenario } from '../systems/scenario'
import { startScenarioCommands } from '../systems/startScenarioCommands'
import { generateChunkCells } from '../systems/world/generateChunk'
import { freshPlanetParamsFor } from '../systems/world/planetParams'
import { CHUNK_CELLS, chunkRangeOfDisc } from '../systems/world/tileGrid'
import { CELL_KIND, kindOfCell } from '../systems/world/worldCell'
import {
  averageFeltOf,
  emptyDrillPaceTally,
  planetMinutesOf,
  tallyDrillPaceStep,
} from './drillPace'
import { formatNdjsonLine } from './ndjson'
import { emptyRadiusRebaselineTally, tallyRadiusRebaselineStep } from './radiusRebaseline'
import {
  gatedRadiusRebaselineProblemsOf,
  printedRadiusRebaselineLinesOf,
  RADIUS_REBASELINE_BARS,
} from './radiusRebaselineBars'
import type { RadiusRebaselineRun } from './radiusRebaselineMedians'

// R3, the P2-P10 re-baseline under the radius rule (ticket 644; GD lock R3 on #302 6306854642, its
// addendum 6306861669, the VS guards on #305 6306854175 and the Campaign Scaling room's rows on
// #644): each pacing seed (83921, 31415, 27182) plays the bot scenario to planet 10's core on the
// registry radii (ticket 643), and the planets' medians are judged on `radiusRebaselineBars.ts`:
// planet minutes 22 to 30 on P1-P10, felt speed at least 0.9x the planet before, drill + tip
// majors 3.5 to 7.0, p* 1.51 +/- 0.03, money per minute within 5% of the #551 equilibrium step,
// ore cells x1.15 a planet, the climb at most 25% of a trip, the travel fee at most 15% of the
// core wallet and paid in full on every P1->P5 hop, travel never blocked and five planets open.
// The rows `{planet, radius, minutes, soldToCore, oreCells}` of each seed go to
// balance-report/radius-rebaseline.ndjson, which the Tester sets beside main's run for the paired
// bar (time to core within 10% of main); the planet row's measured minutes and the paceScale a
// miss retunes first are printed. Three runs of an hour or more each, so this is a lane:
//   npx vitest run src/logging/radiusRebaseline.lane.test.ts
const RUN_TIMEOUT_MS = 6 * 60 * 60 * 1000
/** Two hours a planet, as the drill pace lane allows: a slow planet shows as a number. */
const BUDGET_TICKS = RADIUS_REBASELINE_BARS.lastPlanet * 2 * 60 * 60 * TICKS_PER_SECOND
const SCENARIO_FILE = new URL('../../scenarios/bot-slice.scenario.json', import.meta.url)
const REPORT_FOLDER = new URL('../../balance-report/', import.meta.url)
const SEEDS = PACING_WORLD_SEEDS['bot-slice']
const PLAYER_ID = 'p1'
const PLANETS = Array.from({ length: RADIUS_REBASELINE_BARS.lastPlanet }, (_, at) => at + 1)

describe('the R3 re-baseline: P1 to P10 on the registry radii, three seeds (ticket 644)', () => {
  let runs: RadiusRebaselineRun[] = []

  beforeAll(() => {
    const scenario = JSON.parse(readFileSync(SCENARIO_FILE, 'utf8')) as Scenario
    runs = SEEDS.map((worldSeed) => runOf(scenario, worldSeed))
    console.log(reportOf(runs))
    writeRows(runs)
  }, RUN_TIMEOUT_MS)

  it('holds every R3 bar on the median seed: time, felt speed, cadence, p*, rate, ore, climb and travel', () => {
    expect(gatedRadiusRebaselineProblemsOf(runs)).toEqual([])
  })

  it('prints the steps, the planet rows and the paceScale each miss retunes first', () => {
    console.log(['R3 printed:', ...printedRadiusRebaselineLinesOf(runs)].join('\n'))
    expect(runs.every((run) => run.radius.hops.length > 0)).toBe(true)
  })
})

/** One seed's run of the plain pacing bot, folded into both tallies, with its planets' ore. */
function runOf(scenario: Scenario, worldSeed: number): RadiusRebaselineRun {
  const drill = emptyDrillPaceTally()
  const radius = emptyRadiusRebaselineTally()
  const start = createAuthorityState({
    planetIndex: 1,
    planetSeed: worldSeed,
    playerIds: [PLAYER_ID],
  })
  const session = createBotSession(start, PLAYER_ID, {
    onCommand: () => undefined,
    onEvents: (state, events) => {
      tallyDrillPaceStep(drill, state, PLAYER_ID, events)
      tallyRadiusRebaselineStep(radius, state, PLAYER_ID, events)
    },
  })
  scenarioStartOf(scenario).forEach((intent) => session.submit(intent))
  playSliceFrom(session, botPlanetOf(session, 'blast'), {
    lastPlanet: RADIUS_REBASELINE_BARS.lastPlanet,
    maxTicks: BUDGET_TICKS,
  })
  return { worldSeed, drill, radius, oreCellsByPlanet: oreCellsByPlanetOf(worldSeed) }
}

/** Refused, never trimmed: a broken scenario file. */
function scenarioStartOf(scenario: Scenario): CommandIntent[] {
  const problems = validateScenario(scenario)
  if (problems.length > 0) throw new Error(`R3 scenario refused: ${problems.join('; ')}`)
  const { planetSeed: _sessionSeed, ...start } = startOfScenario(scenario)
  return startScenarioCommands(start)
}

/** Every ore cell of each fresh planet, off generation: the planet's total ore (Systems' pin). */
function oreCellsByPlanetOf(worldSeed: number): Map<number, number> {
  return new Map(PLANETS.map((planet) => [planet, oreCellsOfPlanet(worldSeed, planet)]))
}

function oreCellsOfPlanet(worldSeed: number, planet: number): number {
  const params = freshPlanetParamsFor(worldSeed, planet)
  const { min, max } = chunkRangeOfDisc(params.radiusTiles)
  let oreCells = 0
  for (let cy = min; cy <= max; cy++) {
    for (let cx = min; cx <= max; cx++)
      oreCells += oreCellsOfChunk(generateChunkCells(params, cx, cy))
  }
  return oreCells
}

function oreCellsOfChunk(cells: Uint32Array): number {
  let oreCells = 0
  for (let index = 0; index < CHUNK_CELLS; index++) {
    if (kindOfCell(cells[index]) === CELL_KIND.ore) oreCells++
  }
  return oreCells
}

function reportOf(seedRuns: readonly RadiusRebaselineRun[]): string {
  const header =
    '| seed | planet | radius | minutes | felt avg | drill + tip | sold to core | climb bp | ore cells |'
  const rows = seedRuns.flatMap((run) => PLANETS.flatMap((planet) => reportRowOf(run, planet)))
  return ['R3 re-baseline per planet (ticket 644)', header, ...rows].join('\n')
}

function reportRowOf(run: RadiusRebaselineRun, planet: number): string[] {
  const pace = run.drill.planets.get(planet)
  const money = run.radius.planets.get(planet)
  if (pace === undefined || money === undefined) return []
  const climbBp =
    money.tripTicks === 0 ? '-' : Math.floor((money.climbTicks * 10000) / money.tripTicks)
  const cells = [
    run.worldSeed,
    planet,
    freshPlanetParamsFor(run.worldSeed, planet).radiusTiles,
    planetMinutesOf(pace)?.toFixed(1) ?? 'never',
    averageFeltOf(pace).toFixed(2),
    pace.drillTipMajors,
    toFixedText(money.salesToCore, 0),
    climbBp,
    run.oreCellsByPlanet.get(planet) ?? '-',
  ]
  return [`| ${cells.join(' | ')} |`]
}

/** The paired-run rows, one a seed and planet, for the Tester to set beside main's. */
function writeRows(seedRuns: readonly RadiusRebaselineRun[]): void {
  const measuredAt = new Date().toISOString()
  const lines = seedRuns.flatMap((run) =>
    PLANETS.flatMap((planet) => pairedRowOf(run, planet, measuredAt)),
  )
  mkdirSync(REPORT_FOLDER, { recursive: true })
  writeFileSync(
    new URL('radius-rebaseline.ndjson', REPORT_FOLDER),
    lines.map(formatNdjsonLine).join(''),
  )
}

function pairedRowOf(run: RadiusRebaselineRun, planet: number, measuredAt: string) {
  const pace = run.drill.planets.get(planet)
  const money = run.radius.planets.get(planet)
  if (pace === undefined || money === undefined) return []
  return [
    {
      measuredAt,
      worldSeed: run.worldSeed,
      planet,
      radius: freshPlanetParamsFor(run.worldSeed, planet).radiusTiles,
      minutes: planetMinutesOf(pace)?.toFixed(1) ?? null,
      soldToCore: toFixedText(money.salesToCore, 0),
      oreCells: run.oreCellsByPlanet.get(planet) ?? null,
    },
  ]
}
