/**
 * The runs behind the P1-P5 economy trace (ticket 907): each pacing seed plays the bot scenario to
 * planet 5's core under each kitPolicy hand (HS on the GD lock of 25 Oct, #823: every hazard is
 * passable without its tool, so the bare bot must clear it too). Off is the bare bot that skips
 * every crate, flask and merchant; on is PK7's merchants-on hand (#826): the Cache Crate under
 * `drop_on_full`, the flask uncorked on firedamp, each planet's own kit bought at its merchant.
 * Every step folds into the economy trace and the per-trip fold (ticket 918). Only specs use it.
 */
import { TICKS_PER_SECOND } from '../constants/physics'
import type { CommandIntent } from '../systems/authority/authorityCommand'
import { createAuthorityState, type AuthorityState } from '../systems/authority/authorityState'
import type { DomainEvent } from '../systems/authority/domainEvent'
import { DEFAULT_KIT_POLICY, type KitPolicy } from '../systems/bot/botCrates'
import { createBotSession } from '../systems/bot/botSession'
import { botPlanetOf } from '../systems/bot/botTravel'
import { newDownBoreTally } from '../systems/bot/downBores'
import { playSliceFrom } from '../systems/bot/playSlice'
import { newSidewaysBoreTally } from '../systems/bot/sidewaysBores'
import { startOfScenario, validateScenario, type Scenario } from '../systems/scenario'
import { startScenarioCommands } from '../systems/startScenarioCommands'
import { emptyEconomyTrace, traceEconomyStep } from './economyTrace'
import type { EconomyTraceRun, KitHand } from './economyTraceRows'
import { emptyTripFold, foldTripStep } from './tripFold'

export const ECONOMY_TRACE_LAST_PLANET = 5

export const KIT_POLICIES: Readonly<Record<KitHand, KitPolicy>> = {
  off: DEFAULT_KIT_POLICY,
  on: { crates: 'drop_on_full', flask: 'on_firedamp_entry', merchant: 'buy_local_kit' },
}

/** Two hours a planet, as the R3 lane allows: P5's audit run took over 3 h, so it shows. */
const BUDGET_TICKS = ECONOMY_TRACE_LAST_PLANET * 2 * 60 * 60 * TICKS_PER_SECOND
const PLAYER_ID = 'p1'

export function economyTraceRunOf(
  scenario: Scenario,
  worldSeed: number,
  hand: KitHand,
): EconomyTraceRun {
  const run: EconomyTraceRun = {
    worldSeed,
    hand,
    trace: emptyEconomyTrace(),
    trips: emptyTripFold(),
    endTick: 0,
  }
  const start = createAuthorityState({
    planetIndex: 1,
    planetSeed: worldSeed,
    playerIds: [PLAYER_ID],
  })
  const session = createBotSession(start, PLAYER_ID, {
    onCommand: () => undefined,
    onEvents: (state, events) => traceRunStep(run, state, events),
  })
  scenarioStartOf(scenario).forEach((intent) => session.submit(intent))
  const planet = botPlanetOf(
    session,
    'blast',
    [],
    'never',
    newSidewaysBoreTally(),
    newDownBoreTally(),
    KIT_POLICIES[hand],
  )
  playSliceFrom(session, planet, { lastPlanet: ECONOMY_TRACE_LAST_PLANET, maxTicks: BUDGET_TICKS })
  run.endTick = session.tick()
  return run
}

function traceRunStep(
  run: EconomyTraceRun,
  state: AuthorityState,
  events: readonly DomainEvent[],
): void {
  traceEconomyStep(run.trace, state, PLAYER_ID, events)
  foldTripStep(run.trips, state, PLAYER_ID, events)
}

/** Refused, never trimmed: a broken scenario file. */
function scenarioStartOf(scenario: Scenario): CommandIntent[] {
  const problems = validateScenario(scenario)
  if (problems.length > 0) throw new Error(`economy trace scenario refused: ${problems.join('; ')}`)
  const { planetSeed: _sessionSeed, ...start } = startOfScenario(scenario)
  return startScenarioCommands(start)
}
