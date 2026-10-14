/**
 * The runs behind the armoury's pace lanes (ticket 380's shot shapes, ticket 388's turret modules;
 * the VS pins on #318 and #319): each pacing seed plays the bot scenario to `lastPlanet`'s core once
 * never firing, then once per named run forced to fire at every `nextShotTick` with the gun at its
 * walls (ticket 347's forced run) and that run's modules owned from the start. Every run is held to
 * `balance:bore`'s pins against the same never run (`boreReport.ts`: time to core at least 0.98x on
 * every planet, departure drill_power within 1 level, at least 60 shots, the campaign scaling gate),
 * and the gate is the worst run: any run's miss fails it. The default bot mounts the turret when it
 * is offered (#107), so the turret's modules act from then on. Only specs use it.
 */
import { TICKS_PER_SECOND } from '../../constants/physics'
import {
  deriveBoreReport,
  formatBoreReport,
  type BorePlanetLine,
  type BorePolicyRun,
} from '../../logging/boreReport'
import { recordDomainEventsTo } from '../../logging/domainEventLog'
import { createMemorySink } from '../../logging/eventSink'
import type { RunEventPlace } from '../../logging/runEvent'
import { createRunLog } from '../../logging/runLog'
import { recordStartingPlanet } from '../../logging/startingPlanetLines'
import type { CommandIntent } from '../../systems/authority/authorityCommand'
import { createAuthorityState, type AuthorityState } from '../../systems/authority/authorityState'
import { planetParamsOf } from '../../systems/authority/planetOfState'
import type { BorePolicy } from '../../systems/bot/botBore'
import { playSlice } from '../../systems/bot/playSlice'
import { startOfScenario, type Scenario } from '../../systems/scenario'
import { startScenarioCommands } from '../../systems/startScenarioCommands'
import { LOCKED_SCHEDULE } from '../../systems/unlocks/unlockSchedule'
import { tileOfPose } from '../../systems/vehicle/vehiclePose'
import { depthTilesAt } from '../../systems/world/planetGeometry'

const PLAYER_ID = 'p1'
/** Two hours a planet, as `balance:bore` allows: a slow planet shows as a number. */
const HOURS_A_PLANET = 2

/** One forced run: its name and the armoury modules it owns from the start. */
export interface GunPaceRun {
  name: string
  owned: readonly string[]
}

/** One run's verdict over every seed: its slowest planet and every miss. */
export interface GunPaceVerdict {
  name: string
  worstCoreTimeBp: number | null
  problems: string[]
  report: string
}

/** Seed by seed, so only one seed's never run is held while its forced runs play. */
export function gunPaceVerdictsOf(
  scenario: Scenario,
  seeds: readonly number[],
  runs: readonly GunPaceRun[],
  lastPlanet: number,
): GunPaceVerdict[] {
  const lines = new Map<string, BorePlanetLine[]>(runs.map((run) => [run.name, []]))
  const problems = new Map<string, string[]>(runs.map((run) => [run.name, []]))
  for (const worldSeed of seeds) {
    const never = playOwning({ ...scenario, worldSeed }, 'never', [], lastPlanet)
    for (const run of runs) {
      const forced = playOwning({ ...scenario, worldSeed }, 'forced', run.owned, lastPlanet)
      const report = deriveBoreReport([{ worldSeed, never, forced }], LOCKED_SCHEDULE, lastPlanet)
      lines.get(run.name)?.push(...report.lines)
      problems.get(run.name)?.push(...report.problems)
    }
  }
  return runs.map(({ name }) => verdictOf(name, lines.get(name) ?? [], problems.get(name) ?? []))
}

/** The run with the most misses, then the slowest planet against its never run. */
export function worstGunPaceRunOf(verdicts: readonly GunPaceVerdict[]): GunPaceVerdict {
  return [...verdicts].sort(
    (a, b) =>
      b.problems.length - a.problems.length || (a.worstCoreTimeBp ?? 0) - (b.worstCoreTimeBp ?? 0),
  )[0]
}

export function formatGunPaceVerdicts(verdicts: readonly GunPaceVerdict[]): string {
  return verdicts
    .map(
      (verdict) =>
        `## ${verdict.name}: slowest forced/never ${verdict.worstCoreTimeBp ?? '-'} bp, ${verdict.problems.length} misses\n\n${verdict.report}`,
    )
    .join('\n\n')
}

function verdictOf(name: string, lines: BorePlanetLine[], problems: string[]): GunPaceVerdict {
  const shares = lines.flatMap((line) => (line.coreTimeBp === null ? [] : [line.coreTimeBp]))
  return {
    name,
    worstCoreTimeBp: shares.length === 0 ? null : Math.min(...shares),
    problems,
    report: formatBoreReport({ lines, shotsBySeed: [], problems }),
  }
}

/**
 * One run as `sliceRunLog.ts` logs a pacing run (`game_started`, the starting planet, every domain
 * event, `game_ended`), with the modules put on the guns before the first trip.
 */
function playOwning(
  scenario: Scenario,
  borePolicy: BorePolicy,
  owned: readonly string[],
  lastPlanet: number,
): BorePolicyRun {
  const sink = createMemorySink()
  const start = createAuthorityState({
    planetIndex: 1,
    planetSeed: scenario.worldSeed,
    playerIds: [PLAYER_ID],
  })
  let tick = 0
  const runLog = createRunLog({
    runId: `run_bot_${scenario.name}_shape`,
    sink,
    secondsSinceStart: () => tick / TICKS_PER_SECOND,
  })
  const startStamp = { ...placeOf(start), tick: start.tick }
  runLog.record(startStamp, 'game_started', {
    gameVersion: 'pacing-bot',
    buildCommit: 'pacing-bot',
    platform: 'browser',
    debug: false,
  })
  const params = planetParamsOf(start.planet)
  if (params !== null) recordStartingPlanet(runLog, startStamp, params)
  const run = playSlice(start, {
    maxTicks: lastPlanet * HOURS_A_PLANET * 60 * 60 * TICKS_PER_SECOND,
    lastPlanet,
    borePolicy,
    playerId: PLAYER_ID,
    startCommands: [...startCommandsOf(scenario), ...moduleCommandsOf(owned)],
    listener: {
      onCommand: (command) => runLog.recordCommand(command),
      onEvents: (state, events) => {
        tick = state.tick
        recordDomainEventsTo(runLog, placeOf(state), events)
      },
    },
  })
  const reason = run.isFinished ? 'slice_completed' : 'bot_budget_spent'
  runLog.record({ ...placeOf(run.state), tick: run.state.tick }, 'game_ended', { reason })
  return { events: sink.events, isFinished: run.isFinished }
}

function startCommandsOf(scenario: Scenario): CommandIntent[] {
  const { planetSeed: _sessionSeed, ...start } = startOfScenario(scenario)
  return startScenarioCommands(start)
}

/** The modules owned from the start, through the free debug loadout command. */
function moduleCommandsOf(owned: readonly string[]): CommandIntent[] {
  if (owned.length === 0) return []
  return [{ type: 'debug.setVehicleLoadout', payload: { slots: {}, owned: [...owned] } }]
}

function placeOf(state: AuthorityState): RunEventPlace {
  const params = planetParamsOf(state.planet)
  const { pose } = state.players[PLAYER_ID].vehicle
  const tile = pose === null ? null : tileOfPose(pose)
  const depthTiles = params === null || tile === null ? 0 : depthTilesAt(params, tile.tx, tile.ty)
  return { playerId: PLAYER_ID, planet: state.planet.index, depthTiles }
}
