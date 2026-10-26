/**
 * The runs behind ticket 899's diagonal-heavy casing check (`diagonalHeavyBars.ts`): each pacing
 * seed plays the bot scenario to planet 5's core as the bare bot under each dig policy, its
 * commands and steps folded into the pace, casing and dig tallies. One row per seed, policy and
 * planet goes to the run-comparison log, next to the straight bot's baseline in `tests/balance/`.
 * Only specs use it.
 */
import { TICKS_PER_SECOND } from '../constants/physics'
import type { CommandIntent } from '../systems/authority/authorityCommand'
import { createAuthorityState } from '../systems/authority/authorityState'
import { DEFAULT_BORE_POLICY } from '../systems/bot/botBore'
import { DEFAULT_KIT_POLICY } from '../systems/bot/botCrates'
import { createBotSession } from '../systems/bot/botSession'
import { botPlanetOf } from '../systems/bot/botTravel'
import { newDownBoreTally } from '../systems/bot/downBores'
import type { DigPolicy } from '../systems/bot/mineLayout'
import { playSliceFrom } from '../systems/bot/playSlice'
import { newSidewaysBoreTally } from '../systems/bot/sidewaysBores'
import { toCanonical } from '../systems/money'
import { startOfScenario, validateScenario, type Scenario } from '../systems/scenario'
import { startScenarioCommands } from '../systems/startScenarioCommands'
import { emptyCasingSpendTally, tallyCasingSpendStep } from './casingSpend'
import { DIAGONAL_HEAVY_BARS, planetOfRun, type DigPolicyRun } from './diagonalHeavyBars'
import { emptyDigTally, tallyDigCommand, tallyDigStep } from './diagonalDig'
import { formatNdjsonLine } from './ndjson'
import { emptyRadiusRebaselineTally, tallyRadiusRebaselineStep } from './radiusRebaseline'

/** Two hours a planet, as the R3 lane allows: a slow planet shows as a number. */
const BUDGET_TICKS = DIAGONAL_HEAVY_BARS.lastPlanet * 2 * 60 * 60 * TICKS_PER_SECOND
const PLAYER_ID = 'p1'
/** The schema of a comparison row. */
const COMPARISON_ROW_SCHEMA = 1

export function digPolicyRunOf(
  scenario: Scenario,
  worldSeed: number,
  digPolicy: DigPolicy,
): DigPolicyRun {
  const run: DigPolicyRun = {
    worldSeed,
    digPolicy,
    radius: emptyRadiusRebaselineTally(),
    casing: emptyCasingSpendTally(),
    dig: emptyDigTally(),
  }
  const start = createAuthorityState({
    planetIndex: 1,
    planetSeed: worldSeed,
    playerIds: [PLAYER_ID],
  })
  const session = createBotSession(start, PLAYER_ID, {
    onCommand: (command) => tallyDigCommand(run.dig, command),
    onEvents: (state, events) => {
      tallyRadiusRebaselineStep(run.radius, state, PLAYER_ID, events)
      tallyCasingSpendStep(run.casing, state, PLAYER_ID, events)
      tallyDigStep(run.dig, state, PLAYER_ID, events)
    },
  })
  scenarioStartOf(scenario).forEach((intent) => session.submit(intent))
  playSliceFrom(session, botPlanetUnder(session, digPolicy), {
    lastPlanet: DIAGONAL_HEAVY_BARS.lastPlanet,
    maxTicks: BUDGET_TICKS,
  })
  return run
}

/** The run-comparison log: one NDJSON row per seed, policy and planet. */
export function comparisonLogOf(runs: readonly DigPolicyRun[]): string {
  return runs.flatMap(comparisonRowsOf).map(formatNdjsonLine).join('')
}

function comparisonRowsOf(run: DigPolicyRun): object[] {
  return Array.from({ length: DIAGONAL_HEAVY_BARS.lastPlanet }, (_, index) => {
    const row = planetOfRun(run, index + 1)
    return {
      schema: COMPARISON_ROW_SCHEMA,
      worldSeed: run.worldSeed,
      digPolicy: run.digPolicy,
      ...row,
      moneyPerMinute: row.moneyPerMinute === null ? null : toCanonical(row.moneyPerMinute),
    }
  })
}

function botPlanetUnder(session: ReturnType<typeof createBotSession>, digPolicy: DigPolicy) {
  return botPlanetOf(
    session,
    'blast',
    [],
    DEFAULT_BORE_POLICY,
    newSidewaysBoreTally(),
    newDownBoreTally(),
    DEFAULT_KIT_POLICY,
    digPolicy,
  )
}

/** Refused, never trimmed: a broken scenario file. */
function scenarioStartOf(scenario: Scenario): CommandIntent[] {
  const problems = validateScenario(scenario)
  if (problems.length > 0)
    throw new Error(`diagonal-heavy scenario refused: ${problems.join('; ')}`)
  const { planetSeed: _sessionSeed, ...start } = startOfScenario(scenario)
  return startScenarioCommands(start)
}
