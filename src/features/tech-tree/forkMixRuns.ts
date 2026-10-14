/**
 * The runs behind `balance:forks` (GD lock on #255, build 2; ticket 267): the pacing bot plays the
 * bot scenario from planet 1 to planet 10's core on one pacing seed, forced onto one fork branch
 * from the start (`forkHand.ts`), all else as the pacing gate plays it. Each step is folded into
 * the action-mix and pace tallies as it happens, and only those are kept: the run is let go. Only
 * specs use it.
 */
import { TICKS_PER_SECOND } from '../../constants/physics'
import type { AuthorityCommand, CommandIntent } from '../../systems/authority/authorityCommand'
import { createAuthorityState, type AuthorityState } from '../../systems/authority/authorityState'
import type { DomainEvent } from '../../systems/authority/domainEvent'
import { createBotSession, type BotListener, type BotSession } from '../../systems/bot/botSession'
import { botPlanetOf } from '../../systems/bot/botTravel'
import { playSliceFrom } from '../../systems/bot/playSlice'
import { startOfScenario, validateScenario, type Scenario } from '../../systems/scenario'
import { startScenarioCommands } from '../../systems/startScenarioCommands'
import { tileOfPose } from '../../systems/vehicle/vehiclePose'
import type { TilePoint } from '../../systems/world/tileGrid'
import { forcedForkStartOf, forkHandOf, withForkHand } from './forkHand'
import { forkMixMetricOf, forkMixRolesOf, forkMixValuesOf } from './systems/forkMixMetrics'
import { FORK_REPORT_PLANETS, type ForkSeedRun } from './systems/forkMixReport'
import {
  emptyForkMixTally,
  tallyForkMixStep,
  type ForkMixRoles,
  type ForkMixTally,
} from './systems/forkMixTally'
import {
  emptyForkPaceTally,
  forkPaceOf,
  planetCoreTicksOf,
  tallyForkPaceStep,
  type ForkPaceTally,
} from './systems/forkPace'
import type { TechLane } from './systems/techNode'
import { registeredTechTree, type ForkBranchNode } from './systems/techTree'

/** The lock's runs: to planet 10's core. */
export const FORK_LAST_PLANET = 10
/** Two hours a planet, as `balance:bore` allows: a slow planet shows as a number. */
export const FORK_RUN_BUDGET_TICKS = FORK_LAST_PLANET * 2 * 60 * 60 * TICKS_PER_SECOND
const PLAYER_ID = 'p1'
const STARTING_PLANET_INDEX = 1

/** The registered fork pairs' branches, lane by lane; none until a lane slice registers its pair. */
export function registeredForkBranches(): readonly ForkBranchNode[] {
  return registeredTechTree().forkBranches
}

/** One forced run of `branch` on `worldSeed`, as the report keeps it; a spec may cut it short. */
export function forkSeedRunOf(
  scenario: Scenario,
  branch: ForkBranchNode,
  worldSeed: number,
  maxTicks = FORK_RUN_BUDGET_TICKS,
): ForkSeedRun {
  const recorder = forkRunRecorderOf(forkMixRolesOf(registeredForkBranches()))
  const session = createBotSession(startingState(worldSeed), PLAYER_ID, recorder.listener)
  const hand = forkHandOf(branch.node.unlocks.itemId)
  startForcedRun(session, scenario, branch, hand)
  const forced = withForkHand(session, hand)
  playSliceFrom(forced, botPlanetOf(forced, 'blast'), {
    lastPlanet: FORK_LAST_PLANET,
    maxTicks,
  })
  return seedRunOf(branch, worldSeed, recorder)
}

interface ForkRunRecorder {
  listener: BotListener
  mix: ForkMixTally
  pace: ForkPaceTally
}

/** Folds each step into the tallies: a command's events with it, a wait's alone. */
function forkRunRecorderOf(roles: ForkMixRoles): ForkRunRecorder {
  const mix = emptyForkMixTally()
  const pace = emptyForkPaceTally()
  let command: AuthorityCommand | null = null
  const onEvents = (state: AuthorityState, events: readonly DomainEvent[]) => {
    tallyForkMixStep(mix, { command, vehicleTile: vehicleTileOf(state), events }, roles)
    tallyForkPaceStep(pace, state.planet.index, state.tick, events)
    command = null
  }
  const onCommand = (sent: AuthorityCommand) => {
    command = sent
  }
  return { listener: { onCommand, onEvents }, mix, pace }
}

/** The scenario's start, as the pacing gate sends it, then the forced branch. */
function startForcedRun(
  session: BotSession,
  scenario: Scenario,
  branch: ForkBranchNode,
  hand: ReturnType<typeof forkHandOf>,
): void {
  const pick = { lane: branch.lane, branch: branch.branch }
  const intents = [...scenarioStartOf(scenario), ...forcedForkStartOf(pick, hand)]
  intents.forEach((intent) => session.submit(intent))
}

/** Refused, never trimmed: a broken scenario file. */
function scenarioStartOf(scenario: Scenario): CommandIntent[] {
  const problems = validateScenario(scenario)
  if (problems.length > 0) throw new Error(`fork scenario refused: ${problems.join('; ')}`)
  const { planetSeed: _sessionSeed, ...start } = startOfScenario(scenario)
  return startScenarioCommands(start)
}

function startingState(worldSeed: number): AuthorityState {
  return createAuthorityState({
    planetIndex: STARTING_PLANET_INDEX,
    planetSeed: worldSeed,
    playerIds: [PLAYER_ID],
  })
}

function vehicleTileOf(state: AuthorityState): TilePoint | null {
  const { pose } = state.players[PLAYER_ID].vehicle
  return pose === null ? null : tileOfPose(pose)
}

function seedRunOf(
  branch: ForkBranchNode,
  worldSeed: number,
  recorder: ForkRunRecorder,
): ForkSeedRun {
  const lane: TechLane = branch.lane
  const metric = forkMixMetricOf(lane)
  return {
    lane,
    branch: branch.branch,
    worldSeed,
    pace: forkPaceOf(recorder.pace),
    planetTicks: FORK_REPORT_PLANETS.map((planet) => planetCoreTicksOf(recorder.pace, planet)),
    mixValues: metric === null ? [] : forkMixValuesOf(metric, recorder.mix),
  }
}
