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
  readPlanetWorld,
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
  teleportToDockCommand,
} from '../systems/vehicle/vehicleCommands'
import {
  onCurveVehicleViews,
  vehicleStatsViewOf,
  type OnCurveVehicleView,
  type VehicleStatsView,
} from '../systems/vehicle/vehicleStatsView'
import { statsOfVehicle } from '../systems/vehicle/vehicleState'
import { isEnemyKind } from '../systems/authority/combat/combatDebugRules'
import {
  clearEnemiesCommand,
  freezeEnemiesCommand,
  spawnEnemyCommand,
  type TileOffset,
} from '../systems/authority/combat/combatCommands'
import {
  enemyStatsTableView,
  type EnemyStatsRowView,
} from '../systems/authority/combat/enemyStatsView'
import { facilityLevelProblems } from '../systems/authority/platformState'
import { readSnapshot, type SessionSnapshot } from '../systems/authority/sessionSnapshot'
import { fastForwardProblems, type ScriptedCommand } from '../systems/fastForward'
import { validateScenario, type Scenario } from '../systems/scenario'
import { startScenarioProblems } from '../systems/startScenario'
import { setCoreFragmentsCommand } from '../systems/startScenarioCommands'
import { carveCircleCommand, fillCircleCommand } from '../systems/authority/groundCommands'
import { SOLID_DENSITY } from '../systems/world/sampleGrid'
import { depthTilesOfBasisPoints } from '../systems/world/planetGeometry'
import {
  createDebugInput,
  createDebugUi,
  type DebugInput,
  type DebugResult,
  type DebugUi,
} from './debugScreens'

export class DebugCommandNotImplementedError extends Error {
  constructor(command: string) {
    super(`debug command "${command}" is not implemented yet (design doc section 19)`)
    this.name = 'DebugCommandNotImplementedError'
  }
}

export type { DebugResult }

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

export interface DebugApi {
  // set state (each one a `debug.*` command)
  setPlanet(planetIndex: number): DebugResult
  setPlanetSeed(planetSeed: number): DebugResult
  teleportToDepthTiles(depthTiles: number): DebugResult
  /** `depthBp` is basis points of the planet's radius (#11): 0 the surface, 10000 the centre. */
  teleportToDepth(depthBp: number): DebugResult
  /** The vehicle on the dock point, docked, with no tow and no fee (`debug.teleportToDock`). */
  teleportToDock(): DebugResult
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
  // combat (#9, #11 amendment): the setters are `debug.*` commands, the table read is not logged
  /** `crawler` or `burrower` at any tier, `offset` whole tiles from the vehicle (default 4 right). */
  spawnEnemy(kind: string, tier: number, offset?: TileOffset): DebugResult
  clearEnemies(): DebugResult
  /** Frozen enemies neither move, wind up, attack nor spawn; the drill still cuts them. */
  freezeEnemies(frozen: boolean): DebugResult
  /** Table D of #6 for planets 1 to 40: tiers, health, hits, kill times and side-hit shares. */
  enemyStatsTable(kind: string): DebugResult<{ rows: EnemyStatsRowView[] }>
  // ground (#36): `debug.*` commands; a disc in mm, `amount` 0 to 255 (default all of it)
  /** Lowers density round `(x, y)` mm; credits no ore and never cuts the dock pad. */
  carveCircle(x: number, y: number, radius: number, amount?: number): DebugResult
  /** Raises density round `(x, y)` mm, up to solid ground. */
  fillCircle(x: number, y: number, radius: number, amount?: number): DebugResult
  /** Screens and presentation settings (#33): no command, no log line, never `debugApplied`. */
  ui: DebugUi
  /** Actions pressed at the action layer (#33): their commands are ordinary play. */
  input: DebugInput
  // stubs
  teleportToCore(): void
  giveResource(resourceTier: number, amount: number): void
  unlock(featureId: string): void
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

function enemyKindProblems(kind: unknown): string[] {
  if (isEnemyKind(kind)) return []
  return [`enemy kind must be crawler or burrower, got ${JSON.stringify(kind)}`]
}

function enemyStatsTableOf(kind: string): DebugResult<{ rows: EnemyStatsRowView[] }> {
  const problems = enemyKindProblems(kind)
  if (problems.length > 0 || !isEnemyKind(kind)) return { ok: false, problems }
  return { ok: true, rows: enemyStatsTableView(kind) }
}

const DEPTH_BP_MAX = 10000

function depthBpProblems(depthBp: unknown): string[] {
  const isInRange =
    Number.isSafeInteger(depthBp) && (depthBp as number) >= 0 && (depthBp as number) <= DEPTH_BP_MAX
  if (isInRange && readPlanetWorld().params !== null) return []
  return [
    `depthBp must be a whole number from 0 to ${DEPTH_BP_MAX}, got ${JSON.stringify(depthBp)}`,
  ]
}

function depthTilesOfBp(depthBp: number): number {
  const { params } = readPlanetWorld()
  return params === null ? 0 : depthTilesOfBasisPoints(params, depthBp)
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
    teleportToDepth: (depthBp) =>
      runUnlessRefused(depthBpProblems(depthBp), () =>
        game().teleportToDepthTiles(depthTilesOfBp(depthBp)),
      ),
    teleportToDock: () =>
      runUnlessRefused(vehicleDebugProblems(teleportToDockCommand()), () =>
        game().teleportToDock(),
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
    spawnEnemy: (kind, tier, offset) =>
      runUnlessRefused(vehicleDebugProblems(spawnEnemyCommand(kind, tier, offset)), () =>
        game().spawnEnemy(kind, tier, offset),
      ),
    clearEnemies: () =>
      runUnlessRefused(vehicleDebugProblems(clearEnemiesCommand()), () => game().clearEnemies()),
    freezeEnemies: (frozen) =>
      runUnlessRefused(vehicleDebugProblems(freezeEnemiesCommand(frozen)), () =>
        game().freezeEnemies(frozen),
      ),
    enemyStatsTable: enemyStatsTableOf,
    carveCircle: (x, y, radius, amount = SOLID_DENSITY) =>
      runUnlessRefused(vehicleDebugProblems(carveCircleCommand({ x, y, radius, amount })), () =>
        game().carveCircle({ x, y, radius, amount }),
      ),
    fillCircle: (x, y, radius, amount = SOLID_DENSITY) =>
      runUnlessRefused(vehicleDebugProblems(fillCircleCommand({ x, y, radius, amount })), () =>
        game().fillCircle({ x, y, radius, amount }),
      ),
    ui: createDebugUi(),
    input: createDebugInput(),
    teleportToCore: notImplemented('teleportToCore'),
    giveResource: notImplemented('giveResource'),
    unlock: notImplemented('unlock'),
    setVehicleLoadout: notImplemented('setVehicleLoadout'),
  }
}
