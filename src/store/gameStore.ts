/**
 * The game store: what the UI renders and the actions that change it. It is a replica of the
 * authority (decision #3): actions that change the world or the economy submit a command, and the
 * store copies planet and wallet from the authority when its events arrive. The store never
 * writes those fields itself. Per-frame state (vehicle position, velocity) does NOT live here; it
 * stays in the physics body and refs.
 *
 * Scenario/debug actions log `debug_command_applied` (design doc sections 19-22). The vehicle's
 * play actions (`reportPose`, `requestRescue`), the platform's (dock, sell, repair, recharge, the
 * quick action, upgrades) and the live fixed step are ordinary commands and clock moves; a refused
 * one changes nothing and logs `command_rejected`.
 */
import { create } from 'zustand'
import { recordDomainEvents } from '../logging/domainEventLog'
import { getRunLog } from '../logging/runLog'
import type { RunEventPlace } from '../logging/runEvent'
import type { CommandIntent } from '../systems/authority/authorityCommand'
import { createAuthorityState, type AuthorityState } from '../systems/authority/authorityState'
import type { Enemy } from '../systems/authority/combat/combatState'
import type { DomainEvent } from '../systems/authority/domainEvent'
import { createLoopbackAuthority, type Authority } from '../systems/authority/loopbackAuthority'
import {
  readSnapshot,
  takeSnapshot,
  type SessionSnapshot,
} from '../systems/authority/sessionSnapshot'
import { fastForwardProblems, fastForwardSteps, type ScriptedCommand } from '../systems/fastForward'
import { ZERO_MONEY, type Money } from '../systems/money'
import { startOfScenario, validateScenario, type Scenario } from '../systems/scenario'
import { startScenarioProblems, type StartScenario } from '../systems/startScenario'
import type { PosePayload } from '../systems/vehicle/poseReport'
import { depthTilesOfPose } from '../systems/vehicle/vehiclePose'
import {
  reportPoseCommand,
  requestRescueCommand,
  setEnergyCommand,
  setHullCommand,
  setUpgradeCommand,
  teleportToDockCommand,
} from '../systems/vehicle/vehicleCommands'
import type { VehicleState } from '../systems/vehicle/vehicleState'
import type { OreSelection } from '../systems/authority/platformServices'
import {
  buyUpgradeCommand,
  dockCommand,
  quickServiceCommand,
  rechargeEnergyCommand,
  repairHullCommand,
  sellCargoCommand,
  travelCommand,
  undockCommand,
} from '../systems/platform/platformCommands'
import type { PlanetParams } from '../systems/world/planetParams'
import type { WorldState } from '../systems/world/worldState'
import { planetParamsOf } from '../systems/authority/planetOfState'
import { travelTransitionOf, type TravelTransition } from '../systems/sliceProgress'
import {
  grantMoneyCommand,
  setCoreFragmentsCommand,
  setPlanetCommand,
  setPlanetSeedCommand,
  startScenarioCommands,
} from '../systems/startScenarioCommands'
import {
  advanceAuthorityTo,
  connectAuthority,
  readAuthorityState,
  refusalOf,
  refuseProblems,
  submitCommand,
  submitUnlessRefused,
} from './authorityLink'
import { recordCheckpointLoaded, writeCheckpointAfter, type Checkpoint } from './checkpoint'
import { combatDebugActionsOf, type CombatDebugActions } from './combatDebugActions'
import { groundDebugActionsOf, type GroundDebugActions } from './groundDebugActions'
import { announceFeedback } from './feedbackBroadcast'
import { hintActionsOf, STARTING_HINTS, type HintActions, type HintValues } from './hintSlice'
import { platformReplicaOf, type PlatformReplica } from './platformReplica'
import {
  presentationActionsOf,
  STARTING_PRESENTATION,
  type PresentationActions,
  type PresentationValues,
} from './presentationSlice'
import { runFastForwardSteps, runScenarioScript, submitEach } from './scenarioSteps'
import { vehicleReplicaOf, type VehicleReplica } from './vehicleReplica'

type DebugActions = CombatDebugActions & GroundDebugActions

export interface GameState
  extends DebugActions, PresentationValues, PresentationActions, HintValues, HintActions {
  playerId: string
  planetTier: number
  planetSeed: number
  /** Whole tiles below the surface. Client-owned, like the pose. */
  depthTiles: number
  money: Money
  /** Copied from the authority: a `debug.*` command was accepted in this run (#11 section 4). */
  debugApplied: boolean
  /** Copied from the authority: the local vehicle as the HUD shows it. */
  vehicle: VehicleReplica
  /** Copied from the authority: the core bay and the platform's look (#8, #10). */
  platform: PlatformReplica
  /** Copied from the authority: the bay has reached `coreNeeded` on this planet (#10). */
  isCoreCompleted: boolean
  /** The travel transition on screen (#8: at most 10 s, skippable); the state already changed. */
  travelTransition: TravelTransition | null

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
  /** Quit and resume (#26): play goes on from the checkpoint, docked; not a debug command. */
  resumeCheckpoint(checkpoint: Checkpoint): void
  /** Debug: one upgrade track to an integer level (#7); the stats follow from the levels. */
  setUpgrade(upgradeId: string, level: number): void
  /** Debug: energy in units as a decimal string, a whole number of 1/240 quanta. */
  setEnergy(units: string): void
  /** Debug: hull as a decimal string, at most `hullMax`. */
  setHull(hull: string): void
  /** Debug: the vehicle on the dock point, docked, with no tow and no fee. */
  teleportToDock(): void
  /** The local vehicle's 5 Hz pose report (#11), built by the fixed-step loop. */
  reportPose(pose: PosePayload): void
  requestRescue(): void
  /** The platform (#8): dock when stationary in the pad zone, then its facilities. */
  dock(): void
  undock(): void
  /** One ore tier, or `'all'` of the hold's ore. */
  sellCargo(resourceTier: OreSelection): void
  repairHull(): void
  rechargeEnergy(): void
  /** "Sell, repair and recharge" at current prices. */
  quickService(): void
  buyUpgrade(upgradeId: string): void
  /** `Travel` to the next planet (#10), paying the fee and the core fragments it needs. */
  travel(): void
  /** Ends the travel transition early; only the animation is skipped. */
  finishTravelTransition(): void
  /** Debug: the platform's core bay to a whole number of fragments (#10 `setCoreFragments`). */
  setCoreFragments(count: number): void
  /** One fixed physics step of the live game: the authority's clock moves one tick (#3). */
  advanceOneTick(): void
}

type GameValues = Pick<
  GameState,
  | 'playerId'
  | 'planetTier'
  | 'planetSeed'
  | 'depthTiles'
  | 'money'
  | 'debugApplied'
  | 'vehicle'
  | 'platform'
  | 'isCoreCompleted'
  | keyof PresentationValues
  | keyof HintValues
  | 'travelTransition'
>

const STARTING_PLAYER_ID = 'player_1'
const STARTING_PLANET = { index: 1, seed: 1 }

/** A run starts on planet 1 (#2), the one planet with the starter vein (#16). */
export const STARTING_VALUES: GameValues = {
  playerId: STARTING_PLAYER_ID,
  planetTier: STARTING_PLANET.index,
  planetSeed: STARTING_PLANET.seed,
  depthTiles: 0,
  money: ZERO_MONEY,
  debugApplied: false,
  vehicle: vehicleReplicaOf(startingAuthorityState().players[STARTING_PLAYER_ID].vehicle),
  platform: platformReplicaOf(startingAuthorityState()),
  isCoreCompleted: false,
  ...STARTING_PRESENTATION,
  ...STARTING_HINTS,
  travelTransition: null,
}

export const useGameStore = create<GameState>()((set, get) => ({
  ...STARTING_VALUES,
  ...combatDebugActionsOf(() => get().playerId),
  ...groundDebugActionsOf(() => get().playerId),
  ...presentationActionsOf(set, get),
  ...hintActionsOf(set, get),

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
    get().allowPlaquesFor(scenario)
    const scriptStartTick = readAuthorityState().tick
    get().applyStartScenario(startOfScenario(scenario))
    runScenarioScript(scriptStartTick, scenario.script ?? [], get().fastForward)
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
    replaceSession(restored.state)
    recordDebugCommand(get(), 'restoreSnapshot', { tick: restored.state.tick })
  },

  resumeCheckpoint: (checkpoint) => {
    set({ depthTiles: 0, travelTransition: null })
    replaceSession(checkpoint.state)
    recordCheckpointLoaded(runEventPlaceOf(get()), checkpoint.saveEpoch)
  },

  setUpgrade: (upgradeId, level) =>
    submitUnlessRefused(get().playerId, setUpgradeCommand(upgradeId, level)),

  setEnergy: (units) => submitUnlessRefused(get().playerId, setEnergyCommand(units)),

  setHull: (hull) => submitUnlessRefused(get().playerId, setHullCommand(hull)),

  teleportToDock: () => {
    submitUnlessRefused(get().playerId, teleportToDockCommand())
    set({ depthTiles: 0 })
  },

  reportPose: (pose) => {
    submitCommand(get().playerId, reportPoseCommand(pose))
    set({ depthTiles: depthTilesOfPose(readPlanetWorld().params, pose) })
  },

  requestRescue: () => submitCommand(get().playerId, requestRescueCommand()),

  dock: () => submitCommand(get().playerId, dockCommand()),

  undock: () => submitCommand(get().playerId, undockCommand()),

  sellCargo: (resourceTier) => submitCommand(get().playerId, sellCargoCommand(resourceTier)),

  repairHull: () => submitCommand(get().playerId, repairHullCommand()),

  rechargeEnergy: () => submitCommand(get().playerId, rechargeEnergyCommand()),

  quickService: () => submitCommand(get().playerId, quickServiceCommand()),

  buyUpgrade: (upgradeId) => submitCommand(get().playerId, buyUpgradeCommand(upgradeId)),

  travel: () => submitCommand(get().playerId, travelCommand(get().planetTier + 1)),

  finishTravelTransition: () => set({ travelTransition: null }),

  setCoreFragments: (count) => submitUnlessRefused(get().playerId, setCoreFragmentsCommand(count)),

  advanceOneTick: () => advanceAuthorityTo(readAuthorityState().tick + 1),
}))

/** Why the authority would refuse a vehicle debug command now; empty when it would apply. */
export function vehicleDebugProblems(intent: CommandIntent): string[] {
  return refusalOf(useGameStore.getState().playerId, intent)
}

/** The authority's tick now, without hashing the state as a snapshot would. */
export function readAuthorityTick(): number {
  return readAuthorityState().tick
}

/** The local vehicle as the authority holds it, for the fixed-step loop (never rendered). */
export function readLocalVehicle(): VehicleState {
  return readAuthorityState().players[useGameStore.getState().playerId].vehicle
}

/** The active enemies now, for the scene's per-frame drawing (never rendered through React). */
export function readEnemies(): readonly Enemy[] {
  return readAuthorityState().combat.enemies
}

/** The planet's params and its world deltas now, for physics and the terrain meshes. */
export function readPlanetWorld(): { params: PlanetParams | null; world: WorldState } {
  const state = readAuthorityState()
  return { params: planetParamsOf(state.planet), world: state.world }
}

/** The session as a portable snapshot (#11 section 5): the debug API's `snapshot()`. */
export function takeSessionSnapshot(): SessionSnapshot {
  return takeSnapshot(readAuthorityState())
}

/** A new session for the starting values; tests pass a spy to watch what the store submits. */
export function createStartingAuthority(): Authority {
  return createLoopbackAuthority(startingAuthorityState())
}

function startingAuthorityState(): AuthorityState {
  return createAuthorityState({
    planetIndex: STARTING_PLANET.index,
    planetSeed: STARTING_PLANET.seed,
    playerIds: [STARTING_PLAYER_ID],
  })
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

/**
 * The one writer of planet and wallet: copies them from the authority, starts the travel
 * transition when the events travelled, shows the hints and feedback they trigger, logs the
 * events, then writes the checkpoint when due.
 */
function followAuthority(events: readonly DomainEvent[]): void {
  useGameStore.setState(replicaOf(readAuthorityState(), useGameStore.getState().playerId))
  startTravelTransition(travelTransitionOf(events))
  useGameStore.getState().observePlaques(events)
  announceFeedback(events, useGameStore.getState().playerId)
  recordDomainEvents(runEventPlaceOf(useGameStore.getState()), events)
  writeCheckpointAfter(events, runEventPlaceOf(useGameStore.getState()))
}

/** A restored or resumed session on a fresh authority; its `seq`s continue (authorityLink). */
function replaceSession(state: AuthorityState): void {
  connectAuthority(createLoopbackAuthority(state), followAuthority)
  followAuthority([])
}

function startTravelTransition(transition: TravelTransition | null): void {
  if (transition !== null) useGameStore.setState({ travelTransition: transition })
}

function replicaOf(state: AuthorityState, playerId: string): Partial<GameValues> {
  return {
    planetTier: state.planet.index,
    planetSeed: state.planet.seed,
    money: state.players[playerId].wallet,
    debugApplied: state.debugApplied,
    vehicle: vehicleReplicaOf(state.players[playerId].vehicle),
    platform: platformReplicaOf(state),
    isCoreCompleted: state.core.isCompleted,
  }
}

function placeAtScenarioDepth(scenario: StartScenario): void {
  if (scenario.depthTiles !== undefined) useGameStore.setState({ depthTiles: scenario.depthTiles })
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
