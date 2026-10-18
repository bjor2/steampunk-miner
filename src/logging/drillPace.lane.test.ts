import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { beforeAll, describe, expect, it } from 'vitest'
import { PACING_WORLD_SEEDS } from '../constants/pacingSeeds'
import { TICKS_PER_SECOND } from '../constants/physics'
import type { CommandIntent } from '../systems/authority/authorityCommand'
import { createAuthorityState } from '../systems/authority/authorityState'
import { createBotSession } from '../systems/bot/botSession'
import { botPlanetOf } from '../systems/bot/botTravel'
import { playSliceFrom } from '../systems/bot/playSlice'
import { startOfScenario, validateScenario, type Scenario } from '../systems/scenario'
import { startScenarioCommands } from '../systems/startScenarioCommands'
import {
  averageFeltOf,
  emptyDrillPaceTally,
  incomeGainsOf,
  longestGapMinutesOf,
  planetMinutesOf,
  tallyDrillPaceStep,
} from './drillPace'
import {
  DRILL_PACE_BARS,
  gatedDrillPaceProblemsOf,
  printedDrillPaceFindingsOf,
  type DrillPaceRun,
} from './drillPaceBars'
import { formatNdjsonLine } from './ndjson'
import { toFixedText } from '../systems/money'

// The per-planet drill bars of the GD ruling on #551 (ticket 552), on the bot lane: each pacing
// seed (83921, 31415, 27182) plays the bot scenario to planet 10's core with the per-purchase
// drill, and the planets' medians are judged as VS split them for the lane before #559
// (`drillPaceBars.ts`): planet minutes at most 30, drill-only gaps at most 10 minutes, felt speed
// at least 5 cells/s, no dry tank and no stalled planet are gated; planet minutes at least 22, 3 to
// 4 purchases a planet, the felt ratio, all-track cadence, the income gain per purchase, the level
// milestones and the departure felt speed are printed. The tuning stays open until #559 lands and
// this run reproduces Systems' planet minutes. Every drill purchase's {n, D, price, planet, minute,
// income/h} and every planet's row go to balance-report/drill-pace.ndjson, the run-comparison log
// the Tester sets beside main's run line by line; the first purchase tick of each seed is printed
// for the paired first-purchase bar (at most 5% later than main). Three runs of an hour or more
// each, so this is a lane (vite.config.ts leaves it out unless it is named):
//   npx vitest run src/logging/drillPace.lane.test.ts
const RUN_TIMEOUT_MS = 6 * 60 * 60 * 1000
/** Two hours a planet, as `balance:forks` allows: a slow planet shows as a number. */
const BUDGET_TICKS = DRILL_PACE_BARS.lastPlanet * 2 * 60 * 60 * TICKS_PER_SECOND
const SCENARIO_FILE = new URL('../../scenarios/bot-slice.scenario.json', import.meta.url)
const REPORT_FOLDER = new URL('../../balance-report/', import.meta.url)
const SEEDS = PACING_WORLD_SEEDS['bot-slice']
const PLAYER_ID = 'p1'
/** The schema of a drill pace history row (scripts/ci/drillPaceHistory.mjs checks it). */
const DRILL_PACE_ROW_SCHEMA = 1

describe('drill speed per purchase: the per-planet bars on the bot lane to planet 10 (#551)', () => {
  let runs: DrillPaceRun[] = []

  beforeAll(() => {
    const scenario = JSON.parse(readFileSync(SCENARIO_FILE, 'utf8')) as Scenario
    runs = SEEDS.map((worldSeed) => ({ worldSeed, tally: paceOfRun(scenario, worldSeed) }))
    console.log(reportOf(runs))
    writeRows(runs)
  }, RUN_TIMEOUT_MS)

  it('holds planets 2 to 10 to 30 minutes, drill gaps to 10, felt speed to 5 cells/s, no dry tank and no stall', () => {
    expect(gatedDrillPaceProblemsOf(runs)).toEqual([])
  })

  it('prints the bars that wait on #559, and the first drill purchase of each seed', () => {
    const gains = runs.flatMap(({ worldSeed, tally }) =>
      incomeGainsOf(tally.purchases).map(
        ({ n, planet, gain }) =>
          `seed ${worldSeed} P${planet} purchase ${n}: ${toFixedText(gain, 3)}`,
      ),
    )
    const findings = printedDrillPaceFindingsOf(runs)
    console.log(
      ['income gain per drill purchase:', ...gains, 'printed until #559:', ...findings].join('\n'),
    )
    expect(runs.every((run) => run.tally.purchases.length > 0)).toBe(true)
  })

  // Systems did not model the grind (#551 section 4); #304's measure (a doubled stay adds at most
  // 30% drill speed from P2) has no lane yet.
  it.todo('adds at most 30% drill speed for a doubled stay on any planet from P2 (grind <= 30%)')
})

/** One seed's run of the plain pacing bot, folded into its drill pace. */
function paceOfRun(scenario: Scenario, worldSeed: number) {
  const tally = emptyDrillPaceTally()
  const start = createAuthorityState({
    planetIndex: 1,
    planetSeed: worldSeed,
    playerIds: [PLAYER_ID],
  })
  const session = createBotSession(start, PLAYER_ID, {
    onCommand: () => undefined,
    onEvents: (state, events) => tallyDrillPaceStep(tally, state, PLAYER_ID, events),
  })
  scenarioStartOf(scenario).forEach((intent) => session.submit(intent))
  playSliceFrom(session, botPlanetOf(session, 'blast'), {
    lastPlanet: DRILL_PACE_BARS.lastPlanet,
    maxTicks: BUDGET_TICKS,
  })
  return tally
}

/** Refused, never trimmed: a broken scenario file. */
function scenarioStartOf(scenario: Scenario): CommandIntent[] {
  const problems = validateScenario(scenario)
  if (problems.length > 0) throw new Error(`drill pace scenario refused: ${problems.join('; ')}`)
  const { planetSeed: _sessionSeed, ...start } = startOfScenario(scenario)
  return startScenarioCommands(start)
}

function reportOf(seedRuns: readonly DrillPaceRun[]): string {
  const header =
    '| seed | planet | minutes | drill buys | felt avg | felt at core | longest gap | majors | dry tank |'
  const rows = seedRuns.flatMap(({ worldSeed, tally }) =>
    [...tally.planets.values()].map((pace) =>
      [
        worldSeed,
        pace.planet,
        planetMinutesOf(pace)?.toFixed(1) ?? 'never',
        pace.drillPurchases,
        averageFeltOf(pace).toFixed(2),
        pace.coreFelt?.toFixed(2) ?? '-',
        longestGapMinutesOf(pace).toFixed(1),
        pace.majors,
        pace.tankEmpties,
      ].join(' | '),
    ),
  )
  const firsts = seedRuns.map(
    ({ worldSeed, tally }) =>
      `seed ${worldSeed} first drill purchase at minute ${tally.purchases[0]?.minute ?? 'never'}`,
  )
  return [
    'drill pace per planet (#551)',
    header,
    ...rows.map((row) => `| ${row} |`),
    ...firsts,
  ].join('\n')
}

/** The run-comparison rows, one a drill purchase, as scripts/ci/drillPaceHistory.mjs keeps them. */
function writeRows(seedRuns: readonly DrillPaceRun[]): void {
  const measuredAt = new Date().toISOString()
  const lines = seedRuns.flatMap(({ worldSeed, tally }) =>
    tally.purchases.map((row) => ({
      schema: DRILL_PACE_ROW_SCHEMA,
      id: `${measuredAt}-drill-pace-s${worldSeed}-n${row.n}`,
      measuredAt,
      worldSeed,
      ...row,
    })),
  )
  mkdirSync(REPORT_FOLDER, { recursive: true })
  writeFileSync(new URL('drill-pace.ndjson', REPORT_FOLDER), lines.map(formatNdjsonLine).join(''))
}
