/**
 * The runs behind the PK7 per-planet identity gate (ticket 826; the GD lock of 24 Oct on per-planet
 * identity P1-P5, its VS and Systems rows): each pacing seed plays the bot scenario to planet 5's
 * core twice. Merchants off is the bare bot, which skips every merchant (the skip-all-merchants
 * row). Merchants on makes each planet's own decision: the Cache Crate on planet 1 under
 * `kitPolicy.crates: 'drop_on_full'`, then the local tool or consumable bought at each merchant
 * under `kitPolicy.merchant: 'buy_local_kit'`, the flask uncorked under `kitPolicy.flask`. Both
 * fold the R3 tallies (time, felt speed, money per planet) and the identity trace
 * (`identityTrace.ts`: decisions, spend, fuel and the merchant's income). Only specs use it.
 */
import { TICKS_PER_SECOND } from '../../constants/physics'
import { emptyDrillPaceTally, tallyDrillPaceStep } from '../../logging/drillPace'
import {
  emptyRadiusRebaselineTally,
  tallyRadiusRebaselineStep,
} from '../../logging/radiusRebaseline'
import type { RadiusRebaselineRun } from '../../logging/radiusRebaselineMedians'
import type { CommandIntent } from '../../systems/authority/authorityCommand'
import { createAuthorityState, type AuthorityState } from '../../systems/authority/authorityState'
import type { DomainEvent } from '../../systems/authority/domainEvent'
import { DEFAULT_KIT_POLICY, type KitPolicy } from '../../systems/bot/botCrates'
import { createBotSession } from '../../systems/bot/botSession'
import { botPlanetOf } from '../../systems/bot/botTravel'
import { newDownBoreTally } from '../../systems/bot/downBores'
import { playSliceFrom } from '../../systems/bot/playSlice'
import { newSidewaysBoreTally } from '../../systems/bot/sidewaysBores'
import { startOfScenario, validateScenario, type Scenario } from '../../systems/scenario'
import { startScenarioCommands } from '../../systems/startScenarioCommands'
import { emptyIdentityTrace, traceIdentityStep, type IdentityTrace } from './identityTrace'

export const IDENTITY_PACE_LAST_PLANET = 5

/** Which half of the paired replay a run is. */
export type MerchantHand = 'off' | 'on'

export const MERCHANT_HANDS: Record<MerchantHand, KitPolicy> = {
  off: DEFAULT_KIT_POLICY,
  on: { crates: 'drop_on_full', flask: 'on_firedamp_entry', merchant: 'buy_local_kit' },
}

/** Two hours a planet, as the R3 lane allows: a slow planet shows as a number. */
const BUDGET_TICKS = IDENTITY_PACE_LAST_PLANET * 2 * 60 * 60 * TICKS_PER_SECOND
const PLAYER_ID = 'p1'

/** One seed's run under one hand: the R3 tallies and the identity trace. */
export interface IdentityPaceRun extends RadiusRebaselineRun {
  hand: MerchantHand
  trace: IdentityTrace
}

export function identityPaceRunOf(
  scenario: Scenario,
  worldSeed: number,
  hand: MerchantHand,
): IdentityPaceRun {
  const run = emptyIdentityPaceRun(worldSeed, hand)
  const start = createAuthorityState({
    planetIndex: 1,
    planetSeed: worldSeed,
    playerIds: [PLAYER_ID],
  })
  const session = createBotSession(start, PLAYER_ID, {
    onCommand: () => undefined,
    onEvents: (state, events) => tallyIdentityPaceStep(run, state, events),
  })
  scenarioStartOf(scenario).forEach((intent) => session.submit(intent))
  const planet = botPlanetOf(
    session,
    'blast',
    [],
    'never',
    newSidewaysBoreTally(),
    newDownBoreTally(),
    MERCHANT_HANDS[hand],
  )
  playSliceFrom(session, planet, { lastPlanet: IDENTITY_PACE_LAST_PLANET, maxTicks: BUDGET_TICKS })
  return run
}

function emptyIdentityPaceRun(worldSeed: number, hand: MerchantHand): IdentityPaceRun {
  return {
    worldSeed,
    hand,
    drill: emptyDrillPaceTally(),
    radius: emptyRadiusRebaselineTally(),
    trace: emptyIdentityTrace(),
  }
}

function tallyIdentityPaceStep(
  run: IdentityPaceRun,
  state: AuthorityState,
  events: readonly DomainEvent[],
): void {
  tallyDrillPaceStep(run.drill, state, PLAYER_ID, events)
  tallyRadiusRebaselineStep(run.radius, state, PLAYER_ID, events)
  traceIdentityStep(run.trace, state, PLAYER_ID, events)
}

/** Refused, never trimmed: a broken scenario file. */
function scenarioStartOf(scenario: Scenario): CommandIntent[] {
  const problems = validateScenario(scenario)
  if (problems.length > 0) throw new Error(`identity pace scenario refused: ${problems.join('; ')}`)
  const { planetSeed: _sessionSeed, ...start } = startOfScenario(scenario)
  return startScenarioCommands(start)
}
