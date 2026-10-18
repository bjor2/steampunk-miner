import { readFileSync } from 'node:fs'
import { beforeAll, describe, expect, it } from 'vitest'
import { PACING_WORLD_SEEDS } from '../../constants/pacingSeeds'
import { TICKS_PER_SECOND } from '../../constants/physics'
import type { CommandIntent } from '../../systems/authority/authorityCommand'
import { createAuthorityState } from '../../systems/authority/authorityState'
import { createBotSession, type BotSession } from '../../systems/bot/botSession'
import { botPlanetOf } from '../../systems/bot/botTravel'
import { playSliceFrom } from '../../systems/bot/playSlice'
import { startOfScenario, validateScenario, type Scenario } from '../../systems/scenario'
import { startScenarioCommands } from '../../systems/startScenarioCommands'
import { withRushHand } from './rushHand'
import {
  emptyForkPaceTally,
  minutesOfTicks,
  planetCoreTicksOf,
  tallyForkPaceStep,
  type ForkPaceTally,
} from './systems/forkPace'
import { RUSH_PACE_PINS, rushPaceProblems, type RushSeedRun } from './systems/rushPace'

// The greedy rush bot (#411, the Vertical Scaler's point 2): with the tree gated by price alone,
// each pacing seed (83921, 31415, 27182) plays the bot scenario to planet 10's core twice: once
// as the plain pacing bot, once with the rush hand researching the cheapest drill-gear node it pays
// for at every docked wait, however far ahead its anchor (`rushHand.ts`). On the seed median the
// rush must play planet 1 in 15-30 minutes, every later planet in 22 or more, and reach each core
// no sooner than 0.98x the plain bot (`rushPace.ts`). A miss is a pricing finding for Systems, never
// a reason to retune the bot or a pin. Six runs of hours each, so this is a lane (vite.config.ts
// leaves it out unless it is named):
//   npx vitest run src/features/tech-tree/rushPace.lane.test.ts
const RUN_TIMEOUT_MS = 12 * 60 * 60 * 1000
/** Two hours a planet, as `balance:forks` allows: a slow planet shows as a number. */
const BUDGET_TICKS = RUSH_PACE_PINS.lastPlanet * 2 * 60 * 60 * TICKS_PER_SECOND
const SCENARIO_FILE = new URL('../../../scenarios/bot-slice.scenario.json', import.meta.url)
const SEEDS = PACING_WORLD_SEEDS['bot-slice']
const PLAYER_ID = 'p1'

describe('tech tree: the greedy rush bot against the plain pacing bot to planet 10', () => {
  let runs: RushSeedRun[] = []

  beforeAll(() => {
    const scenario = JSON.parse(readFileSync(SCENARIO_FILE, 'utf8')) as Scenario
    runs = SEEDS.map((worldSeed) => ({
      worldSeed,
      plain: paceOfRun(scenario, worldSeed, (session) => session),
      rush: paceOfRun(scenario, worldSeed, withRushHand),
    }))
    console.log(reportOf(runs))
  }, RUN_TIMEOUT_MS)

  it('holds the rush to 15-30 minutes on planet 1, 22 or more after, and 0.98x the plain cores', () => {
    expect(rushPaceProblems(runs)).toEqual([])
  })

  // #304 Revision 2 section 4's felt-speed growth asserts are superseded for drill power by the GD
  // ruling on #551 (ticket 552): its per-planet bars (felt speed at least 0.9x the planet before
  // and 5 cells/s through P10) run on the plain bot in src/logging/drillPace.lane.test.ts, and the
  // grind todo moved there with them.
})

/** One run's arrival and core ticks, the session wrapped by `hand` before the bot plays it. */
function paceOfRun(
  scenario: Scenario,
  worldSeed: number,
  hand: (session: BotSession) => BotSession,
): ForkPaceTally {
  const tally = emptyForkPaceTally()
  const start = createAuthorityState({
    planetIndex: 1,
    planetSeed: worldSeed,
    playerIds: [PLAYER_ID],
  })
  const session = createBotSession(start, PLAYER_ID, {
    onCommand: () => undefined,
    onEvents: (state, events) => tallyForkPaceStep(tally, state.planet.index, state.tick, events),
  })
  scenarioStartOf(scenario).forEach((intent) => session.submit(intent))
  const played = hand(session)
  playSliceFrom(played, botPlanetOf(played, 'blast'), {
    lastPlanet: RUSH_PACE_PINS.lastPlanet,
    maxTicks: BUDGET_TICKS,
  })
  return tally
}

/** Refused, never trimmed: a broken scenario file. */
function scenarioStartOf(scenario: Scenario): CommandIntent[] {
  const problems = validateScenario(scenario)
  if (problems.length > 0) throw new Error(`rush scenario refused: ${problems.join('; ')}`)
  const { planetSeed: _sessionSeed, ...start } = startOfScenario(scenario)
  return startScenarioCommands(start)
}

function reportOf(seedRuns: readonly RushSeedRun[]): string {
  const planets = Array.from({ length: RUSH_PACE_PINS.lastPlanet }, (_, index) => index + 1)
  const rows = seedRuns.flatMap((run) => [
    `seed ${run.worldSeed} plain: ${planetMinutesOf(run.plain, planets)}`,
    `seed ${run.worldSeed} rush:  ${planetMinutesOf(run.rush, planets)}`,
  ])
  return ['rush pace, minutes arrival to core per planet', ...rows].join('\n')
}

function planetMinutesOf(tally: ForkPaceTally, planets: readonly number[]): string {
  return planets.map((planet) => minutesOfTicks(planetCoreTicksOf(tally, planet))).join(' ')
}
