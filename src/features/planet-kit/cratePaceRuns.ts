/**
 * The runs behind the crates on/off replay (ticket 850; #823's VS row 1, moved here by the GD's
 * final lock on #850): each pacing seed plays the bot scenario to planet 5's core, the merchants'
 * planets, once with the bot's crate policy off and once under `kitPolicy.crates: 'drop_on_full'`
 * (`bot/botCrates.ts`), folding both into the R3 tallies the re-baseline lane reads (time and money
 * per planet) and noting the cargo hold level the bot left each planet with. Only specs use it.
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
import { startOfScenario, validateScenario, type Scenario } from '../../systems/scenario'
import { startScenarioCommands } from '../../systems/startScenarioCommands'

export const CRATE_PACE_LAST_PLANET = 5
export const CRATES_OFF: KitPolicy = { crates: 'never' }
export const CRATES_ON: KitPolicy = { crates: 'drop_on_full' }

/** Two hours a planet, as the R3 lane allows: a slow planet shows as a number. */
const BUDGET_TICKS = CRATE_PACE_LAST_PLANET * 2 * 60 * 60 * TICKS_PER_SECOND
const PLAYER_ID = 'p1'

/** One seed's run under one crate policy: the R3 tallies and what the crates did. */
export interface CratePaceRun extends RadiusRebaselineRun {
  /** The cargo hold level the vehicle had when it left each planet (or at the run's end). */
  cargoLevels: Map<number, number>
  cratesBought: number
  cratesDropped: number
  cratesPickedUp: number
}

export function cratePaceRunOf(
  scenario: Scenario,
  worldSeed: number,
  kitPolicy: KitPolicy,
): CratePaceRun {
  const run = emptyCratePaceRun(worldSeed)
  const start = createAuthorityState({
    planetIndex: 1,
    planetSeed: worldSeed,
    playerIds: [PLAYER_ID],
  })
  const session = createBotSession(start, PLAYER_ID, {
    onCommand: () => undefined,
    onEvents: (state, events) => tallyCratePaceStep(run, state, events),
  })
  scenarioStartOf(scenario).forEach((intent) => session.submit(intent))
  const planet = botPlanetOf(
    session,
    'blast',
    [],
    'never',
    newSidewaysBoreTally(),
    newDownBoreTally(),
    kitPolicy,
  )
  playSliceFrom(session, planet, { lastPlanet: CRATE_PACE_LAST_PLANET, maxTicks: BUDGET_TICKS })
  return run
}

function emptyCratePaceRun(worldSeed: number): CratePaceRun {
  return {
    worldSeed,
    drill: emptyDrillPaceTally(),
    radius: emptyRadiusRebaselineTally(),
    cargoLevels: new Map(),
    cratesBought: 0,
    cratesDropped: 0,
    cratesPickedUp: 0,
  }
}

function tallyCratePaceStep(
  run: CratePaceRun,
  state: AuthorityState,
  events: readonly DomainEvent[],
): void {
  tallyDrillPaceStep(run.drill, state, PLAYER_ID, events)
  tallyRadiusRebaselineStep(run.radius, state, PLAYER_ID, events)
  run.cargoLevels.set(state.planet.index, state.players[PLAYER_ID].vehicle.levels.cargo_hold)
  events.forEach((event) => tallyCrateEvent(run, event))
}

function tallyCrateEvent(run: CratePaceRun, event: DomainEvent): void {
  if (event.type === 'planet-kit.KitItemBought') run.cratesBought += 1
  if (event.type === 'planet-kit.ContainerDropped') run.cratesDropped += 1
  if (event.type === 'planet-kit.ContainerPickedUp') run.cratesPickedUp += 1
}

/** Refused, never trimmed: a broken scenario file. */
function scenarioStartOf(scenario: Scenario): CommandIntent[] {
  const problems = validateScenario(scenario)
  if (problems.length > 0) throw new Error(`crate pace scenario refused: ${problems.join('; ')}`)
  const { planetSeed: _sessionSeed, ...start } = startOfScenario(scenario)
  return startScenarioCommands(start)
}
