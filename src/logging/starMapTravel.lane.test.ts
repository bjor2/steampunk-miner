import { readFileSync } from 'node:fs'
import { beforeAll, describe, expect, it } from 'vitest'
import { PACING_WORLD_SEEDS } from '../constants/pacingSeeds'
import { TICKS_PER_SECOND } from '../constants/physics'
import type { CommandIntent } from '../systems/authority/authorityCommand'
import { createAuthorityState } from '../systems/authority/authorityState'
import { dockedBayOf } from '../systems/authority/dockRules'
import { nextHopShortfallOf } from '../systems/authority/starMap/fuelShopRules'
import type { DomainEvent } from '../systems/authority/domainEvent'
import { jumpFuelUnitsOf } from '../systems/economy/jumpFuel'
import type { UpgradeLevels } from '../systems/economy/vehicleStats'
import { createBotSession, type BotSession } from '../systems/bot/botSession'
import { botPlanetOf } from '../systems/bot/botTravel'
import { arrivedPaceSessionOn, playToCoreFrom } from '../systems/bot/paceArrival'
import { playSliceFrom } from '../systems/bot/playSlice'
import {
  add,
  div,
  fromCanonical,
  fromSafeInteger,
  toSafeInteger,
  ZERO_MONEY,
  type Money,
} from '../systems/money'
import {
  buyFuelCommand,
  buyJumpDriveCommand,
  dockCommand,
  jumpToPlanetCommand,
} from '../systems/platform/platformCommands'
import { startOfScenario, validateScenario, type Scenario } from '../systems/scenario'
import { startScenarioCommands } from '../systems/startScenarioCommands'
import { emptyDrillPaceTally, tallyDrillPaceStep } from './drillPace'
import { emptyRadiusRebaselineTally, tallyRadiusRebaselineStep } from './radiusRebaseline'
import { emptyStarMapTravelTally, tallyStarMapTravelStep } from './starMapTravel'
import {
  gatedStarMapTravelProblemsOf,
  printedStarMapTravelLinesOf,
  STAR_MAP_TRAVEL_BARS,
  type BacktrackRun,
  type StarMapTravelRun,
} from './starMapTravelBars'
import { gatedSystemJumpProblemsOf, printedSystemJumpLinesOf } from './systemJumpBars'

// "Star map travel" (ticket 756; the Systems ruling on #756, the GD lock on #650 and its VS bars):
// the paired P1-P5 run. Each pacing seed (83921, 31415, 27182) plays the bot scenario to planet 5's
// core, buying each hop's fuel and jumping, and the medians are judged on `starMapTravelBars.ts`:
// the hop's fee 8-12% of the wallet at core harvest and its charge at most 15%, the #648 clamp on
// at most 1 of 4 hops a seed, a hop at most one run, P1->P2 paid by the first haul, fuel 3-8% of
// the money spent and the tank at most 6%, felt speed at least 0.9x the planet before. Then, for
// each of planets 1 to 4, the bot arrives on the planet after it with that planet's on-curve gear
// (`paceArrival.ts`) and plays to the core there, or jumps back first and plays to the core it
// left behind: going back must earn less a minute than the frontier (VS). Planet minutes and money
// per minute against #551 stay the R3 lane's (`radiusRebaseline.lane.test.ts`), which plays the
// same bot. Prints each planet's median run against the R the curve stands in, and the felt speed
// on arrival for p -> p+1 and the skip p -> p+2. Since ticket 759 the bot then buys the jump drive
// and jumps out of system 1, and the arrival felt speed in system 2 is gated at 0.9x planet 5's
// (`systemJumpBars.ts`, the Producer's k_jump lock on #759), with the jump's fee at 12-15% of the
// wallet at planet 5's core (ticket 776, J). Hours of play, so it runs only when named:
//   npx vitest run src/logging/starMapTravel.lane.test.ts
const RUN_TIMEOUT_MS = 6 * 60 * 60 * 1000
/** Two hours a planet, as the drill pace lane allows: a slow planet shows as a number. */
const BUDGET_TICKS = STAR_MAP_TRAVEL_BARS.lastPlanet * 2 * 60 * 60 * TICKS_PER_SECOND
/** One planet's core at most: a backtrack or frontier run that drags shows as a low rate. */
const PLANET_BUDGET_TICKS = 2 * 60 * 60 * TICKS_PER_SECOND
const SCENARIO_FILE = new URL('../../scenarios/bot-slice.scenario.json', import.meta.url)
const SEEDS = PACING_WORLD_SEEDS['bot-slice']
const PLAYER_ID = 'p1'
const BACKTRACK_PLANETS = Array.from(
  { length: STAR_MAP_TRAVEL_BARS.openingHopLastFrom },
  (_, at) => at + 1,
)
const TICKS_PER_MINUTE = 60 * TICKS_PER_SECOND

describe('star map travel: P1 to P5 on fuel jumps, three seeds (ticket 756)', () => {
  let runs: StarMapTravelRun[] = []
  let backtracks: BacktrackRun[] = []

  beforeAll(() => {
    const scenario = JSON.parse(readFileSync(SCENARIO_FILE, 'utf8')) as Scenario
    runs = SEEDS.map((worldSeed) => runOf(scenario, worldSeed))
    backtracks = SEEDS.flatMap((worldSeed) =>
      BACKTRACK_PLANETS.map((planet) => backtrackRunOf(worldSeed, planet)),
    )
  }, RUN_TIMEOUT_MS)

  it('holds every star-map travel bar on the median seed: fee, clamp, run, spend, felt and backtrack', () => {
    expect(gatedStarMapTravelProblemsOf(runs, backtracks)).toEqual([])
  })

  it('jumps to system 2 for 12-15% of the core wallet and arrives at 0.9x planet 5 or more (tickets 759, 776)', () => {
    expect(gatedSystemJumpProblemsOf(runs)).toEqual([])
  })

  it('prints the measured runs, the arrival felt speeds and the backtrack rates', () => {
    const lines = [
      ...printedStarMapTravelLinesOf(runs, backtracks),
      ...printedSystemJumpLinesOf(runs),
    ]
    console.log(['Star map travel:', ...lines].join('\n'))
    expect(runs.every((run) => run.radius.hops.length > 0)).toBe(true)
  })
})

/** One seed's run of the plain pacing bot, folded into the three tallies. */
function runOf(scenario: Scenario, worldSeed: number): StarMapTravelRun {
  const drill = emptyDrillPaceTally()
  const radius = emptyRadiusRebaselineTally()
  const starMap = emptyStarMapTravelTally()
  const start = createAuthorityState({
    planetIndex: 1,
    planetSeed: worldSeed,
    playerIds: [PLAYER_ID],
  })
  const tallying = { isOn: true }
  const session = createBotSession(start, PLAYER_ID, {
    onCommand: () => undefined,
    onEvents: (state, events) => {
      if (!tallying.isOn) return
      tallyDrillPaceStep(drill, state, PLAYER_ID, events)
      tallyRadiusRebaselineStep(radius, state, PLAYER_ID, events)
      tallyStarMapTravelStep(starMap, state, PLAYER_ID, events)
    },
  })
  scenarioStartOf(scenario).forEach((intent) => session.submit(intent))
  playSliceFrom(session, botPlanetOf(session, 'blast'), {
    lastPlanet: STAR_MAP_TRAVEL_BARS.lastPlanet,
    maxTicks: BUDGET_TICKS,
  })
  // The P1-P5 bars judge the run to planet 5's core; the jump out of system 1 is judged apart.
  tallying.isOn = false
  return { worldSeed, drill, radius, starMap, systemJumpLevels: jumpOutOfSystemOne(session) }
}

/**
 * Ticket 759: from planet 5's core the bot buys the jump drive and the jump's fuel at the Sell bay
 * and jumps to system 2's first planet; the levels it arrives with, after the fee, are what the
 * system-jump bar reads. Null when a step is refused and the run stays in system 1.
 */
function jumpOutOfSystemOne(session: BotSession): UpgradeLevels | null {
  if (!session.state().core.isCompleted) return null
  if (dockedBayOf(session.state(), PLAYER_ID) !== 'sell') session.submit(dockCommand('sell'))
  session.submit(buyJumpDriveCommand())
  const shortfall = nextHopShortfallOf(session.state(), PLAYER_ID)
  if (shortfall > 0) session.submit(buyFuelCommand(shortfall))
  session.submit(jumpToPlanetCommand(2n, 1n))
  return session.state().planet.system === '2' ? { ...session.vehicle().levels } : null
}

/** Refused, never trimmed: a broken scenario file. */
function scenarioStartOf(scenario: Scenario): CommandIntent[] {
  const problems = validateScenario(scenario)
  if (problems.length > 0) throw new Error(`star map scenario refused: ${problems.join('; ')}`)
  const { planetSeed: _sessionSeed, ...start } = startOfScenario(scenario)
  return startScenarioCommands(start)
}

/** Planet `planet + 1`'s gear back on `planet`, and the same gear on the frontier. */
function backtrackRunOf(worldSeed: number, planet: number): BacktrackRun {
  return {
    worldSeed,
    planet,
    backtrackRate: rateToCoreOf(
      arrivedPaceSessionOn(planet + 1, worldSeed, jumpBackTo(planet)),
      planet,
    ),
    frontierRate: rateToCoreOf(arrivedPaceSessionOn(planet + 1, worldSeed, []), planet + 1),
  }
}

/** Dock, buy the hop's fuel and jump back: the way a player goes back to a cleared planet. */
function jumpBackTo(planet: number): CommandIntent[] {
  const units = toSafeInteger(jumpFuelUnitsOf(planet + 1, planet))
  return [dockCommand('sell'), buyFuelCommand(units), jumpToPlanetCommand(1n, BigInt(planet))]
}

/** Sales a minute from the session's tick to `planet`'s core, or to the budget's end. */
function rateToCoreOf(session: BotSession, planet: number): Money | null {
  if (session.state().planet.index !== planet) {
    throw new Error(
      `the backtrack harness is on planet ${session.state().planet.index}, not ${planet}`,
    )
  }
  const startTick = session.tick()
  const eventsBefore = session.events().length
  playToCoreFrom(session, planet, startTick + PLANET_BUDGET_TICKS)
  const ticks = session.tick() - startTick
  if (ticks === 0) return null
  const sales = salesOf(session.events().slice(eventsBefore))
  return div(sales, div(fromSafeInteger(ticks), fromSafeInteger(TICKS_PER_MINUTE)))
}

function salesOf(events: readonly DomainEvent[]): Money {
  return events.reduce(
    (total, event) =>
      event.type === 'ResourceSold' ? add(total, fromCanonical(event.value)) : total,
    ZERO_MONEY,
  )
}
