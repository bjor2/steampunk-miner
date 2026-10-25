/**
 * The runs behind the tools on/off replay (ticket 881, PK4c T1; Systems' and the VS's rows on
 * #850): each pacing seed plays the bot scenario bare to planet 5's core, and once per hazard tool
 * to its home planet's core with that tool granted at the start (`debug.planet-kit.grantKitItem`,
 * as `balance:forks` grants a fork). The flask's run grants a full stack and uncorks under
 * `kitPolicy.flask: 'on_firedamp_entry'`. Every run folds the R3 tallies (time and money per
 * planet), the ticks each tool acted per planet (the tail counts, VS), and the ledger debit the
 * grants wrote (`kit_item_granted`). Only specs use it.
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
import type { KitPolicy } from '../../systems/bot/botCrates'
import { createBotSession } from '../../systems/bot/botSession'
import { botPlanetOf } from '../../systems/bot/botTravel'
import { newDownBoreTally } from '../../systems/bot/downBores'
import { playSliceFrom } from '../../systems/bot/playSlice'
import { newSidewaysBoreTally } from '../../systems/bot/sidewaysBores'
import { add, fromCanonical, ZERO_MONEY, type Money } from '../../systems/money'
import { startOfScenario, validateScenario, type Scenario } from '../../systems/scenario'
import { startScenarioCommands } from '../../systems/startScenarioCommands'
import { kitToolIdOf } from './systems/kitToolRules'
import { PLANET_KITS } from './systems/planetKitRows'
import type { KitItem } from './systems/planetKitTypes'

export const TOOL_PACE_LAST_PLANET = 5
const PLAYER_ID = 'p1'

/** What one run carries: nothing (bare), or one hazard tool granted at the start. */
export interface ToolHand {
  /** The kit item granted, or null for the bare run. */
  itemId: string | null
  /** How many are granted: 1 for a tool, the carry limit for the flask. */
  grants: number
  lastPlanet: number
  kitPolicy: KitPolicy
}

export const BARE_HAND: ToolHand = {
  itemId: null,
  grants: 0,
  lastPlanet: TOOL_PACE_LAST_PLANET,
  kitPolicy: { crates: 'never' },
}

/** One tools-on run per hazard tool and the flask, each to its home planet, in home order. */
export const TOOL_HANDS: readonly ToolHand[] = PLANET_KITS.items
  .filter((item) => item.effect.hazard !== null)
  .map(handOf)

/** One seed's run with one hand: the R3 tallies and what the tool did. */
export interface ToolPaceRun extends RadiusRebaselineRun {
  hand: ToolHand
  /** Ticks the tool acted (or the flask stood open) on each planet. */
  actingTicks: Map<number, number>
  /** The prices the grants debited in the run's ledger. */
  ledgerDebit: Money
  /** The tick the run ended at: its last planet's core, or the budget. */
  endTick: number
}

export function toolPaceRunOf(scenario: Scenario, worldSeed: number, hand: ToolHand): ToolPaceRun {
  const run = emptyToolPaceRun(worldSeed, hand)
  const start = createAuthorityState({
    planetIndex: 1,
    planetSeed: worldSeed,
    playerIds: [PLAYER_ID],
  })
  const session = createBotSession(start, PLAYER_ID, {
    onCommand: () => undefined,
    onEvents: (state, events) => tallyToolPaceStep(run, state, events),
  })
  ;[...scenarioStartOf(scenario), ...grantsOf(hand)].forEach((intent) => session.submit(intent))
  const planet = botPlanetOf(
    session,
    'blast',
    [],
    'never',
    newSidewaysBoreTally(),
    newDownBoreTally(),
    hand.kitPolicy,
  )
  playSliceFrom(session, planet, { lastPlanet: hand.lastPlanet, maxTicks: budgetOf(hand) })
  run.endTick = session.tick()
  return run
}

function handOf(item: KitItem): ToolHand {
  const isFlask = item.kind === 'consumable'
  return {
    itemId: item.id,
    grants: item.stackLimit ?? 1,
    lastPlanet: Number(item.homePlanet.planet),
    kitPolicy: { crates: 'never', flask: isFlask ? 'on_firedamp_entry' : 'never' },
  }
}

/** Two hours a planet, as the R3 lane allows: a slow planet shows as a number. */
function budgetOf(hand: ToolHand): number {
  return hand.lastPlanet * 2 * 60 * 60 * TICKS_PER_SECOND
}

function grantsOf(hand: ToolHand): CommandIntent[] {
  if (hand.itemId === null) return []
  const grant = {
    type: 'debug.planet-kit.grantKitItem',
    payload: { itemId: hand.itemId },
  } as CommandIntent
  return Array.from({ length: hand.grants }, () => grant)
}

function emptyToolPaceRun(worldSeed: number, hand: ToolHand): ToolPaceRun {
  return {
    worldSeed,
    hand,
    drill: emptyDrillPaceTally(),
    radius: emptyRadiusRebaselineTally(),
    actingTicks: new Map(),
    ledgerDebit: ZERO_MONEY,
    endTick: 0,
  }
}

/** The tool's open acting span, from the tick it started; keyed by run. */
const ACTING_SINCE = new WeakMap<ToolPaceRun, number>()

function tallyToolPaceStep(
  run: ToolPaceRun,
  state: AuthorityState,
  events: readonly DomainEvent[],
): void {
  tallyDrillPaceStep(run.drill, state, PLAYER_ID, events)
  tallyRadiusRebaselineStep(run.radius, state, PLAYER_ID, events)
  events.forEach((event) => tallyToolEvent(run, state.planet.index, event))
}

function tallyToolEvent(run: ToolPaceRun, planet: number, event: DomainEvent): void {
  if (event.type === 'planet-kit.KitItemGranted') {
    run.ledgerDebit = add(run.ledgerDebit, fromCanonical(event.price))
  }
  if (event.type === 'planet-kit.FlaskUncorked') {
    addActingTicks(run, planet, event.untilTick - event.tick)
  }
  if (event.type === 'ToolActingChanged' && event.toolId === toolIdOf(run.hand)) {
    tallyActingEdge(run, planet, event.on, event.tick)
  }
}

function tallyActingEdge(run: ToolPaceRun, planet: number, isOn: boolean, tick: number): void {
  if (isOn) {
    ACTING_SINCE.set(run, tick)
    return
  }
  addActingTicks(run, planet, tick - (ACTING_SINCE.get(run) ?? tick))
  ACTING_SINCE.delete(run)
}

function addActingTicks(run: ToolPaceRun, planet: number, ticks: number): void {
  run.actingTicks.set(planet, (run.actingTicks.get(planet) ?? 0) + ticks)
}

function toolIdOf(hand: ToolHand): string | null {
  return hand.itemId === null ? null : kitToolIdOf(hand.itemId)
}

/** Refused, never trimmed: a broken scenario file. */
function scenarioStartOf(scenario: Scenario): CommandIntent[] {
  const problems = validateScenario(scenario)
  if (problems.length > 0) throw new Error(`tool pace scenario refused: ${problems.join('; ')}`)
  const { planetSeed: _sessionSeed, ...start } = startOfScenario(scenario)
  return startScenarioCommands(start)
}
