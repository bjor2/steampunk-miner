import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { beforeAll, describe, expect, it } from 'vitest'
import { PACING_WORLD_SEEDS } from '../../constants/pacingSeeds'
import { TICKS_PER_SECOND } from '../../constants/physics'
import { emptyDrillPaceTally, tallyDrillPaceStep } from '../../logging/drillPace'
import { formatNdjsonLine } from '../../logging/ndjson'
import {
  emptyRadiusRebaselineTally,
  tallyRadiusRebaselineStep,
} from '../../logging/radiusRebaseline'
import { emptyStarMapTravelTally, tallyStarMapTravelStep } from '../../logging/starMapTravel'
import type { CommandIntent } from '../../systems/authority/authorityCommand'
import { createAuthorityState } from '../../systems/authority/authorityState'
import { dockedBayOf } from '../../systems/authority/dockRules'
import { nextHopShortfallOf } from '../../systems/authority/starMap/fuelShopRules'
import { createBotSession, type BotSession } from '../../systems/bot/botSession'
import { botPlanetOf } from '../../systems/bot/botTravel'
import { playSliceFrom } from '../../systems/bot/playSlice'
import {
  buyFuelCommand,
  buyJumpDriveCommand,
  dockCommand,
  jumpToPlanetCommand,
} from '../../systems/platform/platformCommands'
import { startOfScenario, validateScenario, type Scenario } from '../../systems/scenario'
import { toIndexText } from '../../systems/starMap/planetAddress'
import { startScenarioCommands } from '../../systems/startScenarioCommands'
import {
  gatedSystemTwoPaceProblemsOf,
  printedSystemTwoPaceLinesOf,
  SYSTEM_TWO_PACE_BARS,
  systemTwoPlanetIndexes,
  type SystemTwoPaceRun,
} from './systemTwoPace'
import { systemTwoPlanetRowsOf, systemTwoReportOf } from './systemTwoPaceReport'

// The re-baseline "solar system 2" (ticket 779, spec #774; the GD lock of 23 Oct 20:20 on Campaign
// Scaling): each pacing seed (83921, 31415, 27182) plays the bot scenario to system 1's planet 5
// core, buys the jump drive and the jump's fuel at the Sell bay and jumps (ticket 759), then plays
// system 2 to its last core, jumping planet to planet on fuel as in system 1. The medians of
// system 2's planets are judged on `systemTwoPace.ts`: 22-30 min a planet, felt speed at least
// 0.9x the planet before (the jump's step included), drill + tip majors 3.5-7.0, money per minute
// within 5% of the #551 equilibrium, fuel 3-8% of the money spent in the system, every core
// reached. Each seed's rows go to balance-report/solar-system-2.ndjson for the Tester's paired run
// and print with the roster's draw beside the world. A miss is retuned step > paceScale > radius,
// never the drill law or prices. Hours of play, so this is a lane:
//   npx vitest run src/features/solar-systems/systemTwoPace.lane.test.ts
const RUN_TIMEOUT_MS = 10 * 60 * 60 * 1000
const LAST_PLANET = systemTwoPlanetIndexes().at(-1) ?? 0
/** Two hours a planet over both systems, as the drill pace lane allows: a slow one shows as a number. */
const BUDGET_TICKS = LAST_PLANET * 2 * 60 * 60 * TICKS_PER_SECOND
/** System 1's last planet, whose core the jump leaves from. */
const LAST_FIRST_SYSTEM_PLANET = systemTwoPlanetIndexes()[0] - 1
const SCENARIO_FILE = new URL('../../../scenarios/bot-slice.scenario.json', import.meta.url)
const REPORT_FOLDER = new URL('../../../balance-report/', import.meta.url)
const SEEDS = PACING_WORLD_SEEDS['bot-slice']
const PLAYER_ID = 'p1'

describe('the re-baseline "solar system 2": system 1 to its last core, then system 2, three seeds (ticket 779)', () => {
  let runs: SystemTwoPaceRun[] = []

  beforeAll(() => {
    const scenario = JSON.parse(readFileSync(SCENARIO_FILE, 'utf8')) as Scenario
    runs = SEEDS.map((worldSeed) => runOf(scenario, worldSeed))
    const rows = systemTwoPlanetRowsOf(runs)
    console.log(systemTwoReportOf(rows))
    mkdirSync(REPORT_FOLDER, { recursive: true })
    writeFileSync(
      new URL('solar-system-2.ndjson', REPORT_FOLDER),
      rows.map(formatNdjsonLine).join(''),
    )
  }, RUN_TIMEOUT_MS)

  it('holds every system 2 bar on the median seed: minutes, felt speed, cadence, money rate and fuel', () => {
    expect(gatedSystemTwoPaceProblemsOf(runs)).toEqual([])
  })

  it('prints the money steps, the amber cadence, the fuel share and the fix order of a miss', () => {
    console.log(['Solar system 2 printed:', ...printedSystemTwoPaceLinesOf(runs)].join('\n'))
    expect(runs.every((run) => run.drill.planets.size > 0)).toBe(true)
  })
})

/** One seed's run of the plain pacing bot over both systems, folded into the tallies. */
function runOf(scenario: Scenario, worldSeed: number): SystemTwoPaceRun {
  const run: SystemTwoPaceRun = {
    worldSeed,
    drill: emptyDrillPaceTally(),
    radius: emptyRadiusRebaselineTally(),
    systemTwo: emptyStarMapTravelTally(),
    hasJumped: false,
  }
  const session = createBotSession(startState(worldSeed), PLAYER_ID, {
    onCommand: () => undefined,
    onEvents: (state, events) => {
      tallyDrillPaceStep(run.drill, state, PLAYER_ID, events)
      tallyRadiusRebaselineStep(run.radius, state, PLAYER_ID, events)
      if (run.hasJumped) tallyStarMapTravelStep(run.systemTwo, state, PLAYER_ID, events)
    },
  })
  scenarioStartOf(scenario).forEach((intent) => session.submit(intent))
  playTo(session, LAST_FIRST_SYSTEM_PLANET)
  run.hasJumped = hasJumpedIntoSystemTwo(session)
  if (run.hasJumped) playTo(session, LAST_PLANET)
  return run
}

function startState(worldSeed: number) {
  return createAuthorityState({ planetIndex: 1, planetSeed: worldSeed, playerIds: [PLAYER_ID] })
}

/** Plays on, the bot afresh on the session's planet, until `lastPlanet`'s core or the budget. */
function playTo(session: BotSession, lastPlanet: number): void {
  playSliceFrom(session, botPlanetOf(session, 'blast'), { lastPlanet, maxTicks: BUDGET_TICKS })
}

/**
 * From system 1's last core the bot buys the jump drive and the jump's fuel at the Sell bay and
 * jumps to system 2's first planet (ticket 759); false when a step is refused.
 */
function hasJumpedIntoSystemTwo(session: BotSession): boolean {
  if (!session.state().core.isCompleted) return false
  if (dockedBayOf(session.state(), PLAYER_ID) !== 'sell') session.submit(dockCommand('sell'))
  session.submit(buyJumpDriveCommand())
  const shortfall = nextHopShortfallOf(session.state(), PLAYER_ID)
  if (shortfall > 0) session.submit(buyFuelCommand(shortfall))
  session.submit(jumpToPlanetCommand(SYSTEM_TWO_PACE_BARS.system, 1n))
  return session.state().planet.system === toIndexText(SYSTEM_TWO_PACE_BARS.system)
}

/** Refused, never trimmed: a broken scenario file. */
function scenarioStartOf(scenario: Scenario): CommandIntent[] {
  const problems = validateScenario(scenario)
  if (problems.length > 0)
    throw new Error(`solar system 2 scenario refused: ${problems.join('; ')}`)
  const { planetSeed: _sessionSeed, ...start } = startOfScenario(scenario)
  return startScenarioCommands(start)
}
