import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { PACING_WORLD_SEEDS } from '../../constants/pacingSeeds'
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
import {
  CEMENTING_ROUND_ITEM_ID,
  EARTHING_SPIKE_ITEM_ID,
  RIFLED_BORE_ITEM_ID,
  SPLAY_CHOKE_ITEM_ID,
  STRUT_BORE_ITEM_ID,
} from './systems/boreGunLane'

// The pace gates per shot shape (ticket 380, VS on #318: "pace gates run per shape and gate on the
// worst shape, P40 headless included"). Each pacing seed plays the bot scenario to planet 40's core
// once never firing, then once per shape forced to fire at every `nextShotTick` with the gun at its
// walls (ticket 347's forced run) and that one signature module on the gun from the start: plain,
// splay choke, cementing round, earthing spike, rifled bore, strut bore. Every shape is held to
// `balance:bore`'s pins against the same never run (`boreReport.ts`: time to core at least 0.98x
// on every planet, departure drill_power within 1 level, at least 60 shots, the campaign scaling
// gate), and the gate is the worst shape: any shape's miss fails it. The modules ride from planet
// 1, ahead of their nodes, so each shape is judged at its strongest reach over the whole campaign.
// Headless and hours long, so this is a lane (vite.config.ts leaves it out unless it is named):
//   npx vitest run src/features/ground-gun/shapePace.lane.test.ts
// A miss is a balance finding, never a reason to retune the bot or a constant.
const LAST_PLANET = 40
/** Two hours a planet, as `balance:bore` allows: a slow planet shows as a number. */
const BUDGET_TICKS = LAST_PLANET * 2 * 60 * 60 * TICKS_PER_SECOND
const RUN_TIMEOUT_MS = 24 * 60 * 60 * 1000
const PLAYER_ID = 'p1'
const SCENARIO_FILE = new URL('../../../scenarios/bot-slice.scenario.json', import.meta.url)

interface ShotShapeRun {
  name: string
  /** The signature module on the gun from the start; none for the plain gun. */
  owned: readonly string[]
}

const SHAPES: readonly ShotShapeRun[] = [
  { name: 'plain', owned: [] },
  { name: 'splay choke', owned: [SPLAY_CHOKE_ITEM_ID] },
  { name: 'cementing round', owned: [CEMENTING_ROUND_ITEM_ID] },
  { name: 'earthing spike', owned: [EARTHING_SPIKE_ITEM_ID] },
  { name: 'rifled bore', owned: [RIFLED_BORE_ITEM_ID] },
  { name: 'strut bore', owned: [STRUT_BORE_ITEM_ID] },
]

/** One shape's verdict over every seed: its slowest planet and every miss. */
interface ShapeVerdict {
  name: string
  worstCoreTimeBp: number | null
  problems: string[]
  report: string
}

describe('ground-gun: pace gates per shot shape to planet 40 (ticket 380)', () => {
  it(
    'keeps every shape inside the bore pins, the worst shape gating',
    () => {
      const scenario = JSON.parse(readFileSync(SCENARIO_FILE, 'utf8')) as Scenario
      const verdicts = shapeVerdictsOf(scenario, PACING_WORLD_SEEDS['bot-slice'])
      console.log(formatVerdicts(verdicts))
      const worst = worstShapeOf(verdicts)
      expect(worst.problems, `worst shape: ${worst.name}`).toEqual([])
    },
    RUN_TIMEOUT_MS,
  )
})

/** Seed by seed, so only one seed's never run is held while its shapes play. */
function shapeVerdictsOf(scenario: Scenario, seeds: readonly number[]): ShapeVerdict[] {
  const lines = new Map<string, BorePlanetLine[]>(SHAPES.map((shape) => [shape.name, []]))
  const problems = new Map<string, string[]>(SHAPES.map((shape) => [shape.name, []]))
  for (const worldSeed of seeds) {
    const never = playShaped({ ...scenario, worldSeed }, 'never', [])
    for (const shape of SHAPES) {
      const forced = playShaped({ ...scenario, worldSeed }, 'forced', shape.owned)
      const report = deriveBoreReport([{ worldSeed, never, forced }], LOCKED_SCHEDULE, LAST_PLANET)
      lines.get(shape.name)?.push(...report.lines)
      problems.get(shape.name)?.push(...report.problems)
    }
  }
  return SHAPES.map(({ name }) => verdictOf(name, lines.get(name) ?? [], problems.get(name) ?? []))
}

function verdictOf(name: string, lines: BorePlanetLine[], problems: string[]): ShapeVerdict {
  const shares = lines.flatMap((line) => (line.coreTimeBp === null ? [] : [line.coreTimeBp]))
  return {
    name,
    worstCoreTimeBp: shares.length === 0 ? null : Math.min(...shares),
    problems,
    report: formatBoreReport({ lines, shotsBySeed: [], problems }),
  }
}

/** The shape with the most misses, then the slowest planet against its never run. */
function worstShapeOf(verdicts: readonly ShapeVerdict[]): ShapeVerdict {
  return [...verdicts].sort(
    (a, b) =>
      b.problems.length - a.problems.length || (a.worstCoreTimeBp ?? 0) - (b.worstCoreTimeBp ?? 0),
  )[0]
}

function formatVerdicts(verdicts: readonly ShapeVerdict[]): string {
  return verdicts
    .map(
      (verdict) =>
        `## ${verdict.name}: slowest forced/never ${verdict.worstCoreTimeBp ?? '-'} bp, ${verdict.problems.length} misses\n\n${verdict.report}`,
    )
    .join('\n\n')
}

/**
 * One run as `sliceRunLog.ts` logs a pacing run (`game_started`, the starting planet, every domain
 * event, `game_ended`), with the module put on the gun before the first trip.
 */
function playShaped(
  scenario: Scenario,
  borePolicy: BorePolicy,
  owned: readonly string[],
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
    maxTicks: BUDGET_TICKS,
    lastPlanet: LAST_PLANET,
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

/** The module owned from the start, through the free debug loadout command. */
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
