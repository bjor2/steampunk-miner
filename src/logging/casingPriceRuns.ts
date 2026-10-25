/**
 * The runs behind #894's casing bars (`casingPriceBars.ts`): each pacing seed plays the bot
 * scenario to planet 5's core as the bare bot (no merchant, no forced bore), and its steps fold
 * into the casing tally. Only specs use it.
 */
import { TICKS_PER_SECOND } from '../constants/physics'
import type { CommandIntent } from '../systems/authority/authorityCommand'
import { createAuthorityState } from '../systems/authority/authorityState'
import { createBotSession } from '../systems/bot/botSession'
import { botPlanetOf } from '../systems/bot/botTravel'
import { playSliceFrom } from '../systems/bot/playSlice'
import { startOfScenario, validateScenario, type Scenario } from '../systems/scenario'
import { startScenarioCommands } from '../systems/startScenarioCommands'
import { CASING_PRICE_BARS, type CasingPriceRun } from './casingPriceBars'
import { emptyCasingSpendTally, tallyCasingSpendStep } from './casingSpend'

/** Two hours a planet, as the R3 lane allows: a slow planet shows as a number. */
const BUDGET_TICKS = CASING_PRICE_BARS.lastPlanet * 2 * 60 * 60 * TICKS_PER_SECOND
const PLAYER_ID = 'p1'

export function casingPriceRunOf(scenario: Scenario, worldSeed: number): CasingPriceRun {
  const run: CasingPriceRun = { worldSeed, casing: emptyCasingSpendTally() }
  const start = createAuthorityState({
    planetIndex: 1,
    planetSeed: worldSeed,
    playerIds: [PLAYER_ID],
  })
  const session = createBotSession(start, PLAYER_ID, {
    onCommand: () => undefined,
    onEvents: (state, events) => tallyCasingSpendStep(run.casing, state, PLAYER_ID, events),
  })
  scenarioStartOf(scenario).forEach((intent) => session.submit(intent))
  playSliceFrom(session, botPlanetOf(session, 'blast'), {
    lastPlanet: CASING_PRICE_BARS.lastPlanet,
    maxTicks: BUDGET_TICKS,
  })
  return run
}

/** Refused, never trimmed: a broken scenario file. */
function scenarioStartOf(scenario: Scenario): CommandIntent[] {
  const problems = validateScenario(scenario)
  if (problems.length > 0) throw new Error(`casing price scenario refused: ${problems.join('; ')}`)
  const { planetSeed: _sessionSeed, ...start } = startOfScenario(scenario)
  return startScenarioCommands(start)
}
