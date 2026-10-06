/**
 * A pacing-bot run as a run log (#29, decision #11): the scenario's start applied as `debug.*`
 * commands, the bot's play, every domain event projected and stamped as the store stamps a live
 * run's, and every command kept as `commands.ndjson`. The pacing report and the comparison are
 * derived from these events only (#11 section 3: derived data stays derived).
 */
import { TICKS_PER_SECOND } from '../constants/physics'
import type { AuthorityCommand, CommandIntent } from '../systems/authority/authorityCommand'
import { createAuthorityState, type AuthorityState } from '../systems/authority/authorityState'
import { planetParamsOf } from '../systems/authority/planetOfState'
import type { ChargePolicy } from '../systems/bot/botCharges'
import type { GunPolicy } from '../systems/bot/botGuns'
import type { RefineryUse } from '../systems/bot/botRefining'
import { playSlice, type SliceRun } from '../systems/bot/playSlice'
import { startOfScenario, validateScenario, type Scenario } from '../systems/scenario'
import { startScenarioCommands } from '../systems/startScenarioCommands'
import { depthTilesAt } from '../systems/world/planetGeometry'
import { tileOfPose } from '../systems/vehicle/vehiclePose'
import { recordDomainEventsTo } from './domainEventLog'
import { createMemorySink } from './eventSink'
import type { RunEvent, RunEventPlace } from './runEvent'
import { createRunLog, type RunLog } from './runLog'
import { recordStartingPlanet } from './startingPlanetLines'

export interface LoggedSliceRun {
  run: SliceRun
  events: readonly RunEvent[]
  commands: readonly AuthorityCommand[]
}

const PLAYER_ID = 'p1'
const STARTING_PLANET_INDEX = 1
/** Three hours of play: past the 130-minute slice target, so a slow build shows as a number. */
export const BOT_RUN_BUDGET_TICKS = 3 * 60 * 60 * TICKS_PER_SECOND

export interface LoggedRunOptions {
  /** Plays on past the slice to this planet's core (a report, #29 note 2). */
  lastPlanet?: number
  maxTicks?: number
  /** `never` plays without `auto_guns`, the comparison run of #107 acceptance 5. */
  gunPolicy?: GunPolicy
  /** Whether the bot blasts hard tiles from planet 7 (#109 bot policy); default `blast`. */
  chargePolicy?: ChargePolicy
  /** Whether the bot refines from the Refinery bay's planet (#105 acceptance 7); default `used`. */
  refinery?: RefineryUse
}

/** One run of a scenario on one of its pacing world seeds (#84). */
export interface SeededSliceRun extends LoggedSliceRun {
  worldSeed: number
}

/**
 * The scenario played once per world seed, its own seed swapped for each (#84): the bot, the
 * scenario's start and the options are the same in every run, so only the world differs.
 */
export function playLoggedSliceOnSeeds(
  scenario: Scenario,
  worldSeeds: readonly number[],
  options: LoggedRunOptions = {},
): SeededSliceRun[] {
  return worldSeeds.map((worldSeed) => ({
    worldSeed,
    ...playLoggedSlice({ ...scenario, worldSeed }, options),
  }))
}

export function playLoggedSlice(
  scenario: Scenario,
  options: LoggedRunOptions = {},
): LoggedSliceRun {
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
    maxTicks: options.maxTicks ?? BOT_RUN_BUDGET_TICKS,
    lastPlanet: options.lastPlanet,
    gunPolicy: options.gunPolicy,
    chargePolicy: options.chargePolicy,
    refinery: options.refinery,
    playerId: PLAYER_ID,
    startCommands: startCommandsOf(scenario),
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

/**
 * The scenario's start as `debug.*` commands, without the world seed: the session is created on
 * that seed, so a fresh-start scenario sends no debug command and its run counts as play.
 */
function startCommandsOf(scenario: Scenario): CommandIntent[] {
  const { planetSeed: _sessionSeed, ...start } = startOfScenario(scenario)
  return startScenarioCommands(start)
}

function startingState(scenario: Scenario): AuthorityState {
  return createAuthorityState({
    planetIndex: STARTING_PLANET_INDEX,
    planetSeed: scenario.worldSeed,
    playerIds: [PLAYER_ID],
  })
}

/** As a live run starts (#2 log sequence): `game_started`, then the first planet's lines. */
function recordRunStart(runLog: RunLog, start: AuthorityState): void {
  const stamp = { ...placeOf(start), tick: start.tick }
  runLog.record(stamp, 'game_started', {
    gameVersion: 'pacing-bot',
    buildCommit: 'pacing-bot',
    platform: 'browser',
    debug: false,
  })
  const params = planetParamsOf(start.planet)
  if (params !== null) recordStartingPlanet(runLog, stamp, params)
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
