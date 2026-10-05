/**
 * A pacing-bot run as a run log (#29, decision #11): the scenario's start applied as `debug.*`
 * commands, the bot's play, every domain event projected and stamped as the store stamps a live
 * run's, and every command kept as `commands.ndjson`. The pacing report and the comparison are
 * derived from these events only (#11 section 3: derived data stays derived).
 */
import { TICKS_PER_SECOND } from '../constants/physics'
import type { AuthorityCommand } from '../systems/authority/authorityCommand'
import { createAuthorityState, type AuthorityState } from '../systems/authority/authorityState'
import { planetEntryOf } from '../systems/authority/planetEntry'
import { planetParamsOf } from '../systems/authority/planetOfState'
import { playSlice, type SliceRun } from '../systems/bot/playSlice'
import { startOfScenario, validateScenario, type Scenario } from '../systems/scenario'
import { startScenarioCommands } from '../systems/startScenarioCommands'
import { depthTilesAt } from '../systems/world/planetGeometry'
import { tileOfPose } from '../systems/vehicle/vehiclePose'
import { recordDomainEventsTo } from './domainEventLog'
import { createMemorySink } from './eventSink'
import type { RunEvent, RunEventPlace } from './runEvent'
import { createRunLog, type RunLog } from './runLog'

export interface LoggedSliceRun {
  run: SliceRun
  events: readonly RunEvent[]
  commands: readonly AuthorityCommand[]
}

const PLAYER_ID = 'p1'
const STARTING_PLANET_INDEX = 1
/** Three hours of play: past the 130-minute slice target, so a slow build shows as a number. */
export const BOT_RUN_BUDGET_TICKS = 3 * 60 * 60 * TICKS_PER_SECOND

export function playLoggedSlice(scenario: Scenario): LoggedSliceRun {
  refuseBotScenario(scenario)
  const start = startingState(scenario)
  let tick = 0
  const sink = createMemorySink()
  const runLog = createRunLog({
    runId: `run_bot_${scenario.name}`,
    sink,
    secondsSinceStart: () => tick / TICKS_PER_SECOND,
  })
  recordRunStart(runLog, start)
  const run = playSlice(start, {
    maxTicks: BOT_RUN_BUDGET_TICKS,
    playerId: PLAYER_ID,
    startCommands: startScenarioCommands(startOfScenario(scenario)),
    listener: {
      onCommand: (command) => runLog.recordCommand(command),
      onEvents: (state, events) => {
        tick = state.tick
        recordDomainEventsTo(runLog, placeOf(state), events)
      },
    },
  })
  recordRunEnd(runLog, run)
  return { run, events: sink.events, commands: sink.commands }
}

/** Refused, never trimmed: a broken file, or a script the bot would have to ignore. */
function refuseBotScenario(scenario: Scenario): void {
  const problems = [
    ...validateScenario(scenario),
    ...((scenario.script ?? []).length > 0 ? ['a pacing-bot scenario has no script'] : []),
  ]
  if (problems.length > 0) throw new Error(`bot scenario refused: ${problems.join('; ')}`)
}

function startingState(scenario: Scenario): AuthorityState {
  return createAuthorityState({
    planetIndex: STARTING_PLANET_INDEX,
    planetSeed: scenario.worldSeed,
    playerIds: [PLAYER_ID],
  })
}

/** As a live run starts (#2 log sequence): `game_started`, then the first `planet_entered`. */
function recordRunStart(runLog: RunLog, start: AuthorityState): void {
  const stamp = { ...placeOf(start), tick: start.tick }
  runLog.record(stamp, 'game_started', {
    gameVersion: 'pacing-bot',
    buildCommit: 'pacing-bot',
    platform: 'browser',
    debug: false,
  })
  const params = planetParamsOf(start.planet)
  if (params !== null) runLog.record(stamp, 'planet_entered', planetEntryOf(params))
}

function recordRunEnd(runLog: RunLog, run: SliceRun): void {
  const reason = run.isFinished ? 'slice_completed' : 'bot_budget_spent'
  runLog.record({ ...placeOf(run.state), tick: run.state.tick }, 'game_ended', { reason })
}

/** The planet the session is on and how deep the vehicle's last reported pose is. */
function placeOf(state: AuthorityState): RunEventPlace {
  const params = planetParamsOf(state.planet)
  const { pose } = state.players[PLAYER_ID].vehicle
  const tile = pose === null ? null : tileOfPose(pose)
  const depthTiles = params === null || tile === null ? 0 : depthTilesAt(params, tile.tx, tile.ty)
  return { playerId: PLAYER_ID, planet: state.planet.index, depthTiles }
}
