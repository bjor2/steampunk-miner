/**
 * The debug/scenario API (design doc sections 19-20, decision #11 section 5): what a developer, a
 * Vitest spec or an AI-driven Playwright test needs to put the game in any state without playing
 * there. Exposed as `window.steampunkDebug` only when the debug API is enabled.
 *
 * Every wired method validates its arguments first and answers `{ ok: true, ... }` or
 * `{ ok: false, problems }`; a refused call changes nothing. State changes go through the store,
 * which submits `debug.*` authority commands, so they replay and are logged as
 * `debug_command_applied`. Stubs (typed, throw DebugCommandNotImplementedError) wait for the
 * system they poke.
 */
import {
  readLocalVehicle,
  takeSessionSnapshot,
  useGameStore,
  vehicleDebugProblems,
  type GameState,
} from '../store/gameStore'
import type { UpgradeLevels } from '../systems/economy/vehicleStats'
import {
  setEnergyCommand,
  setHullCommand,
  setUpgradeCommand,
} from '../systems/vehicle/vehicleCommands'
import {
  onCurveVehicleViews,
  vehicleStatsViewOf,
  type OnCurveVehicleView,
  type VehicleStatsView,
} from '../systems/vehicle/vehicleStatsView'
import { statsOfVehicle } from '../systems/vehicle/vehicleState'
import { CAMERA_MODES, isCameraMode, type CameraMode } from '../systems/render/cameraTurn'
import { facilityLevelProblems } from '../systems/authority/platformState'
import { readSnapshot, type SessionSnapshot } from '../systems/authority/sessionSnapshot'
import { fastForwardProblems, type ScriptedCommand } from '../systems/fastForward'
import { validateScenario, type Scenario } from '../systems/scenario'
import { startScenarioProblems } from '../systems/startScenario'
import { setCoreFragmentsCommand } from '../systems/startScenarioCommands'

export class DebugCommandNotImplementedError extends Error {
  constructor(command: string) {
    super(`debug command "${command}" is not implemented yet (design doc section 19)`)
    this.name = 'DebugCommandNotImplementedError'
  }
}

export type DebugResult<T extends object = object> =
  ({ ok: true } & T) | { ok: false; problems: string[] }

/** Where the authority stands after a time or snapshot command. */
export interface SessionPoint {
  tick: number
  digest: string
}

/** `vehicleStats()`: the levels the vehicle holds, its stats, and the on-curve table (#7, #14). */
export interface VehicleStatsReport {
  levels: UpgradeLevels
  stats: VehicleStatsView
  onCurveByPlanet: OnCurveVehicleView[]
}

/** What `ui.getPrefs()` reads: local presentation settings. */
export interface UiPrefs {
  cameraMode: CameraMode
}

/**
 * The `ui.*` namespace (#11 amendment 2): local presentation state only. No command, not logged,
 * not in the digest, and it never sets `debugApplied`.
 */
export interface DebugUi {
  /** `rotating` (local down at the bottom of the screen) or `fixed` (#13 accessibility). */
  setCameraMode(mode: string): DebugResult
  getPrefs(): DebugResult<{ prefs: UiPrefs }>
}

export interface DebugApi {
  // set state (each one a `debug.*` command)
  setPlanet(planetIndex: number): DebugResult
  setPlanetSeed(planetSeed: number): DebugResult
  teleportToDepthTiles(depthTiles: number): DebugResult
  /** `amount` is a decimal string >= 0, for example "1e100" (decision #5). */
  giveMoney(amount: string): DebugResult
  /** A `scenarioVersion` 1 file, already parsed from JSON. */
  applyScenario(scenario: unknown): DebugResult<SessionPoint>
  scenarioProblems(scenario: unknown): string[]
  // time
  /** Advances the authority headlessly; `commands` are submitted at their absolute ticks. */
  fastForward(ticks: number, commands?: readonly ScriptedCommand[]): DebugResult<SessionPoint>
  // snapshot and restore
  snapshot(): DebugResult<{ snapshot: SessionSnapshot }>
  restore(snapshot: unknown): DebugResult<SessionPoint>
  // vehicle (#7, #11 amendment): the setters are `debug.*` commands, the read is not logged
  /** One track to an integer level; level 1500 on `drill_tip` is fine (uncapped, #7). */
  setUpgrade(upgradeId: string, level: number): DebugResult
  /** Energy in units as a decimal string, a whole number of 1/240 quanta up to the tank. */
  setEnergy(units: string): DebugResult
  /** Hull as a canonical decimal string, at most `hullMax`; 0 destroys the vehicle. */
  setHull(hull: string): DebugResult
  vehicleStats(): DebugResult<VehicleStatsReport>
  /**
   * `shop`, `workshop` or `charging` (#8): facilities have one level in the slice, so level 1 is
   * accepted and changes nothing, and any other level is a listed problem.
   */
  setFacilityLevel(facilityId: string, level: number): DebugResult
  /** The platform's core bay to `count` fragments (#10); 63 on planet 1 completes the core. */
  setCoreFragments(count: number): DebugResult
  ui: DebugUi
  // stubs
  /** `depthBp` is basis points of the radius (#11); the radius arrives with the generator. */
  teleportToDepth(depthBp: number): void
  teleportToCore(): void
  teleportToDock(): void
  giveResource(resourceTier: number, amount: number): void
  unlock(featureId: string): void
  spawnEnemy(enemyKind: string, tier: number): void
  setVehicleLoadout(loadoutId: string): void
}

function notImplemented(command: string): () => never {
  return () => {
    throw new DebugCommandNotImplementedError(command)
  }
}

/** Runs only when there is no problem; a refused call changes nothing. */
function runUnlessRefused(problems: string[], run: () => void): DebugResult {
  if (problems.length > 0) return { ok: false, problems }
  run()
  return { ok: true }
}

/** As runUnlessRefused, then says where the authority stands. */
function runAndReportPoint(problems: string[], run: () => void): DebugResult<SessionPoint> {
  const result = runUnlessRefused(problems, run)
  return result.ok ? { ok: true, ...sessionPoint() } : result
}

function sessionPoint(): SessionPoint {
  const { tick, digest } = takeSessionSnapshot()
  return { tick, digest }
}

const game = (): GameState => useGameStore.getState()

function cameraModeProblems(mode: unknown): string[] {
  if (isCameraMode(mode)) return []
  return [`camera mode must be one of ${CAMERA_MODES.join(', ')}, got ${JSON.stringify(mode)}`]
}

function vehicleStatsReport(): VehicleStatsReport {
  const vehicle = readLocalVehicle()
  return {
    levels: vehicle.levels,
    stats: vehicleStatsViewOf(statsOfVehicle(vehicle)),
    onCurveByPlanet: onCurveVehicleViews(),
  }
}

export function createDebugApi(): DebugApi {
  return {
    setPlanet: (planetIndex) =>
      runUnlessRefused(startScenarioProblems({ planetTier: planetIndex }), () =>
        game().setPlanet(planetIndex),
      ),
    setPlanetSeed: (planetSeed) =>
      runUnlessRefused(startScenarioProblems({ planetSeed }), () =>
        game().setPlanetSeed(planetSeed),
      ),
    teleportToDepthTiles: (depthTiles) =>
      runUnlessRefused(startScenarioProblems({ depthTiles }), () =>
        game().teleportToDepthTiles(depthTiles),
      ),
    giveMoney: (amount) =>
      runUnlessRefused(startScenarioProblems({ money: amount }), () => game().giveMoney(amount)),
    applyScenario: (scenario) =>
      runAndReportPoint(validateScenario(scenario), () =>
        game().applyScenario(scenario as Scenario),
      ),
    scenarioProblems: validateScenario,
    fastForward: (ticks, commands = []) =>
      runAndReportPoint(fastForwardProblems(sessionPoint().tick, ticks, commands), () =>
        game().fastForward(ticks, commands),
      ),
    snapshot: () => ({ ok: true, snapshot: takeSessionSnapshot() }),
    restore: (snapshot) =>
      runAndReportPoint(readSnapshot(snapshot).problems, () => game().restoreSnapshot(snapshot)),
    setUpgrade: (upgradeId, level) =>
      runUnlessRefused(vehicleDebugProblems(setUpgradeCommand(upgradeId, level)), () =>
        game().setUpgrade(upgradeId, level),
      ),
    setEnergy: (units) =>
      runUnlessRefused(vehicleDebugProblems(setEnergyCommand(units)), () =>
        game().setEnergy(units),
      ),
    setHull: (hull) =>
      runUnlessRefused(vehicleDebugProblems(setHullCommand(hull)), () => game().setHull(hull)),
    vehicleStats: () => ({ ok: true, ...vehicleStatsReport() }),
    setFacilityLevel: (facilityId, level) =>
      runUnlessRefused(facilityLevelProblems(facilityId, level), () => {}),
    setCoreFragments: (count) =>
      runUnlessRefused(vehicleDebugProblems(setCoreFragmentsCommand(count)), () =>
        game().setCoreFragments(count),
      ),
    ui: {
      setCameraMode: (mode) =>
        runUnlessRefused(cameraModeProblems(mode), () => game().setCameraMode(mode as CameraMode)),
      getPrefs: () => ({ ok: true, prefs: { cameraMode: game().cameraMode } }),
    },
    teleportToDepth: notImplemented('teleportToDepth'),
    teleportToCore: notImplemented('teleportToCore'),
    teleportToDock: notImplemented('teleportToDock'),
    giveResource: notImplemented('giveResource'),
    unlock: notImplemented('unlock'),
    spawnEnemy: notImplemented('spawnEnemy'),
    setVehicleLoadout: notImplemented('setVehicleLoadout'),
  }
}
