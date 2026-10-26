/**
 * The runs behind ticket 829's bot rows (`casingPolicyBars.ts`): each pacing seed plays the bot
 * scenario to planet 3's core three times, keeping its casing on the curve, one grade short, and
 * not at all, and each run's core ticks, sales, bursts and grade buys are folded from its events.
 * Only specs use it.
 */
import { TICKS_PER_SECOND } from '../constants/physics'
import type { CommandIntent } from '../systems/authority/authorityCommand'
import { createAuthorityState, type AuthorityState } from '../systems/authority/authorityState'
import type { DomainEvent } from '../systems/authority/domainEvent'
import type { CasingPolicy } from '../systems/bot/botCasing'
import { createBotSession } from '../systems/bot/botSession'
import { botPlanetOf } from '../systems/bot/botTravel'
import { playSliceFrom } from '../systems/bot/playSlice'
import { add, fromCanonical, ZERO_MONEY, type Money } from '../systems/money'
import { startOfScenario, validateScenario, type Scenario } from '../systems/scenario'
import { startScenarioCommands } from '../systems/startScenarioCommands'
import { CASING_POLICY_BARS, type CasingPolicyRun } from './casingPolicyBars'

/** Two hours a planet, as the R3 lane allows: a slow planet shows as a number. */
const BUDGET_TICKS = CASING_POLICY_BARS.lastPlanet * 2 * 60 * 60 * TICKS_PER_SECOND
const PLAYER_ID = 'p1'

interface RunTally {
  coreTicks: Map<number, number>
  earned: Money
  bursts: number
  gradesBought: Map<number, number>
}

export function casingPolicyRunOf(
  scenario: Scenario,
  worldSeed: number,
  policy: CasingPolicy,
): CasingPolicyRun {
  const tally: RunTally = {
    coreTicks: new Map(),
    earned: ZERO_MONEY,
    bursts: 0,
    gradesBought: new Map(),
  }
  const start = createAuthorityState({
    planetIndex: 1,
    planetSeed: worldSeed,
    playerIds: [PLAYER_ID],
  })
  const session = createBotSession(start, PLAYER_ID, {
    onCommand: () => undefined,
    onEvents: (state, events) => events.forEach((event) => tallyEvent(tally, state, event)),
  })
  scenarioStartOf(scenario).forEach((intent) => session.submit(intent))
  const planet = botPlanetOf(
    session,
    'blast',
    [],
    undefined,
    undefined,
    undefined,
    undefined,
    policy,
  )
  playSliceFrom(session, planet, {
    lastPlanet: CASING_POLICY_BARS.lastPlanet,
    maxTicks: BUDGET_TICKS,
  })
  return { worldSeed, ...tally, ticks: session.tick() }
}

function tallyEvent(tally: RunTally, state: AuthorityState, event: DomainEvent): void {
  const planet = state.planet.index
  if (event.type === 'CoreCompleted') tally.coreTicks.set(planet, event.tick)
  if (event.type === 'ResourceSold') tally.earned = add(tally.earned, fromCanonical(event.value))
  if (event.type === 'CasingBurst') tally.bursts += 1
  if (event.type === 'CasingUpgraded') {
    tally.gradesBought.set(planet, (tally.gradesBought.get(planet) ?? 0) + 1)
  }
}

/** Refused, never trimmed: a broken scenario file. */
function scenarioStartOf(scenario: Scenario): CommandIntent[] {
  const problems = validateScenario(scenario)
  if (problems.length > 0) throw new Error(`casing policy scenario refused: ${problems.join('; ')}`)
  const { planetSeed: _sessionSeed, ...start } = startOfScenario(scenario)
  return startScenarioCommands(start)
}
