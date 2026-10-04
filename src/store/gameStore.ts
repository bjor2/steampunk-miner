/**
 * The game store: what the UI renders and the actions that change it. It is a replica of the
 * authority (decision #3): actions that change the world or the economy submit a command, and the
 * store copies planet and wallet from the authority when its events arrive. The store never
 * writes those fields itself. Per-frame state (vehicle position, velocity) does NOT live here; it
 * stays in the physics body and refs.
 *
 * Every action here is a scenario/debug command so far, so each logs `debug_command_applied`
 * (design doc sections 19-22). Gameplay actions (drill, sell, buy) arrive with their own commands.
 */
import { create } from 'zustand'
import { recordDomainEvents } from '../logging/domainEventLog'
import { getRunLog } from '../logging/runLog'
import type { RunEventPlace } from '../logging/runEvent'
import type { CommandIntent } from '../systems/authority/authorityCommand'
import { createAuthorityState, type AuthorityState } from '../systems/authority/authorityState'
import type { DomainEvent } from '../systems/authority/domainEvent'
import { createLoopbackAuthority, type Authority } from '../systems/authority/loopbackAuthority'
import {
  readSnapshot,
  takeSnapshot,
  type SessionSnapshot,
} from '../systems/authority/sessionSnapshot'
import {
  fastForwardProblems,
  fastForwardSteps,
  type FastForwardStep,
  type ScriptedCommand,
} from '../systems/fastForward'
import { ZERO_MONEY, type Money } from '../systems/money'
import {
  startOfScenario,
  validateScenario,
  type Scenario,
  type ScriptStep,
} from '../systems/scenario'
import { startScenarioProblems, type StartScenario } from '../systems/startScenario'
import {
  grantMoneyCommand,
  setPlanetCommand,
  setPlanetSeedCommand,
  startScenarioCommands,
} from '../systems/startScenarioCommands'
import {
  advanceAuthorityTo,
  connectAuthority,
  readAuthorityState,
  submitCommand,
} from './authorityLink'

export interface GameState {
  playerId: string
  planetTier: number
  planetSeed: number
  /** Whole tiles below the surface. Client-owned, like the pose. */
  depthTiles: number
  money: Money
  /** Copied from the authority: a `debug.*` command was accepted in this run (#11 section 4). */
  debugApplied: boolean

  setPlanet(planetTier: number): void
  setPlanetSeed(planetSeed: number): void
  teleportToDepthTiles(depthTiles: number): void
  /** `amount` is a decimal string >= 0, for example "1e100". */
  giveMoney(amount: string): void
  applyStartScenario(scenario: StartScenario): void
  /** A scenario file (#11 section 4): its start as `debug.*` commands, then its script. */
  applyScenario(scenario: Scenario): void
  /** Advances the authority headlessly, submitting scripted commands at their ticks. */
  fastForward(ticks: number, commands?: readonly ScriptedCommand[]): void
  /** Replaces the session with a snapshot's state; refused whole on any problem. */
  restoreSnapshot(snapshot: unknown): void
}

type GameValues = Pick<
  GameState,
  'playerId' | 'planetTier' | 'planetSeed' | 'depthTiles' | 'money' | 'debugApplied'
>

export const STARTING_VALUES: GameValues = {
  playerId: 'player_1',
  planetTier: 0,
  planetSeed: 1,
  depthTiles: 0,
  money: ZERO_MONEY,
  debugApplied: false,
}

export const useGameStore = create<GameState>()((set, get) => ({
  ...STARTING_VALUES,

  setPlanet: (planetTier) => {
    refuseProblems(startScenarioProblems({ planetTier }))
    set({ depthTiles: 0 })
    submitCommand(get().playerId, setPlanetCommand(planetTier))
  },

  setPlanetSeed: (planetSeed) => {
    refuseProblems(startScenarioProblems({ planetSeed }))
    submitCommand(get().playerId, setPlanetSeedCommand(planetSeed))
  },

  teleportToDepthTiles: (depthTiles) => {
    refuseProblems(startScenarioProblems({ depthTiles }))
    set({ depthTiles })
    recordDebugCommand(get(), 'teleportToDepthTiles', { depthTiles })
  },

  giveMoney: (amount) => {
    refuseProblems(startScenarioProblems({ money: amount }))
    submitCommand(get().playerId, grantMoneyCommand(amount))
  },

  applyStartScenario: (scenario) => {
    refuseProblems(startScenarioProblems(scenario))
    placeAtScenarioDepth(scenario)
    submitEach(get().playerId, startScenarioCommands(scenario))
  },

  applyScenario: (scenario) => {
    refuseProblems(validateScenario(scenario))
    const scriptStartTick = readAuthorityState().tick
    get().applyStartScenario(startOfScenario(scenario))
    runScenarioScript(scriptStartTick, scenario.script ?? [])
  },

  fastForward: (ticks, commands = []) => {
    const fromTick = readAuthorityState().tick
    refuseProblems(fastForwardProblems(fromTick, ticks, commands))
    recordDebugCommand(get(), 'fastForward', { ticks, commands: commands.length })
    runFastForwardSteps(get().playerId, fastForwardSteps(fromTick, ticks, commands))
  },

  restoreSnapshot: (snapshot) => {
    const restored = readSnapshot(snapshot)
    if (!('state' in restored)) return refuseProblems(restored.problems)
    connectAuthority(createLoopbackAuthority(restored.state), followAuthority)
    followAuthority([])
    recordDebugCommand(get(), 'restoreSnapshot', { tick: restored.state.tick })
  },
}))

/** The session as a portable snapshot (#11 section 5): the debug API's `snapshot()`. */
export function takeSessionSnapshot(): SessionSnapshot {
  return takeSnapshot(readAuthorityState())
}

/** A new session for the starting values; tests pass a spy to watch what the store submits. */
export function createStartingAuthority(): Authority {
  return createLoopbackAuthority(
    createAuthorityState({
      planetIndex: STARTING_VALUES.planetTier,
      planetSeed: STARTING_VALUES.planetSeed,
      playerIds: [STARTING_VALUES.playerId],
    }),
  )
}

/** Back to a fresh run on a fresh authority; tests call this in beforeEach. */
export function resetGameStore(authority: Authority = createStartingAuthority()): void {
  useGameStore.setState({ ...STARTING_VALUES })
  connectAuthority(authority, followAuthority)
}

resetGameStore()

/** Where in the world the player is, for stamping events. */
export function runEventPlaceOf(state: GameValues): RunEventPlace {
  return { playerId: state.playerId, planet: state.planetTier, depthTiles: state.depthTiles }
}

/** The one writer of planet and wallet: copies them from the authority, then logs the events. */
function followAuthority(events: readonly DomainEvent[]): void {
  useGameStore.setState(replicaOf(readAuthorityState(), useGameStore.getState().playerId))
  recordDomainEvents(runEventPlaceOf(useGameStore.getState()), events)
}

function replicaOf(state: AuthorityState, playerId: string): Partial<GameValues> {
  return {
    planetTier: state.planet.index,
    planetSeed: state.planet.seed,
    money: state.players[playerId].wallet,
    debugApplied: state.debugApplied,
  }
}

function placeAtScenarioDepth(scenario: StartScenario): void {
  if (scenario.depthTiles !== undefined) useGameStore.setState({ depthTiles: scenario.depthTiles })
}

function submitEach(playerId: string, intents: readonly CommandIntent[]): void {
  for (const intent of intents) submitCommand(playerId, intent)
}

/**
 * Script ticks count from the tick the scenario was applied at; a step whose tick an earlier
 * fast-forward already passed runs at once, so time never goes backwards.
 */
function runScenarioScript(scriptStartTick: number, script: readonly ScriptStep[]): void {
  for (const step of script) {
    advanceAuthorityTo(Math.max(scriptStartTick + step.tick, readAuthorityState().tick))
    useGameStore.getState().fastForward(step.args.ticks)
  }
}

function runFastForwardSteps(playerId: string, steps: readonly FastForwardStep[]): void {
  for (const step of steps) {
    if (step.kind === 'advance') advanceAuthorityTo(step.tick)
    else submitCommand(playerId, step.intent)
  }
}

/** A scenario is refused, never trimmed: every problem is named, nothing is applied. */
function refuseProblems(problems: string[]): void {
  if (problems.length > 0) throw new Error(problems.join('; '))
}

/**
 * Depth is client-owned (the vehicle pose, #3), so moving it is logged here, not projected from the
 * authority. It is stamped with the authority's tick and no `cmd`: no authority command caused it.
 */
function recordDebugCommand(
  state: GameValues,
  command: string,
  args: Record<string, unknown>,
): void {
  const stamp = { ...runEventPlaceOf(state), tick: readAuthorityState().tick }
  getRunLog().record(stamp, 'debug_command_applied', { command, args })
}
