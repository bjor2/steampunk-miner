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
import { mountedPartsShown, type MountedPartsShown } from '../scene/mountedPartsPresence'
import { partMotion } from '../scene/partMotionPresence'
import { SHIPPED_ART } from '../scene/shippedArt'
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
  setChargesCommand,
  setGunLevelCommand,
  setHeatCommand,
  setLiningTypeCommand,
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
import type { PartPose } from '../systems/render/partMotion'
import { gunPartIdsOf } from '../systems/render/gunLook'
import { vehiclePartIdsOf, vehiclePartPosesOf } from '../systems/render/vehicleLook'
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
import type { ArtefactReport } from '../systems/authority/heldArtefact'
import { setArtefactCommand } from '../systems/artefacts/artefactCommands'
import { readArtefactReport } from '../store/artefactActions'
import { setVehicleLoadout } from '../store/loadoutActions'
import { setVehicleLoadoutCommand } from '../systems/authority/loadoutCommands'
import { readSnapshot, type SessionSnapshot } from '../systems/authority/sessionSnapshot'
import { fastForwardProblems, type ScriptedCommand } from '../systems/fastForward'
import { validateScenario, type Scenario } from '../systems/scenario'
import { startScenarioProblems } from '../systems/startScenario'
import { setCoreFragmentsCommand } from '../systems/startScenarioCommands'
import { carveCircleCommand, fillCircleCommand } from '../systems/authority/groundCommands'
import {
  gnawCasingCommand,
  lineCasingCommand,
  setCasingGradeCommand,
} from '../systems/authority/casingDebugCommands'
import { forceCollapseCommand } from '../systems/authority/collapse/collapseCommands'
import type { CollapseReport } from '../systems/authority/collapse/collapseReport'
import { readCollapseReport } from '../store/collapseReads'
import { exportSnapshotZip } from '../store/runSnapshots'
import type { SnapshotExport } from '../shell/shell'
import type { BayId } from '../systems/world/dockBays'
import { SOLID_DENSITY } from '../systems/world/sampleGrid'
import { depthTilesOfBasisPoints } from '../systems/world/planetGeometry'
import { readPhysicsStats, type PhysicsStats } from './debugMemory'
import {
  createDebugInput,
  createDebugUi,
  type DebugInput,
  type DebugResult,
  type DebugUi,
} from './debugScreens'
import { debugActionsBySlice, type SliceDebugActions } from './debugActionRegistry'

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

/** `artefact()`: the held artefact and how this planet's cache reads (#46 `debug.artefact`). */
export type { ArtefactReport }

/**
 * `vehicleParts()`: the art part ids the run vehicle draws at its visual tier (#52 acc. 6), and
 * each part's pose now (#48 acceptance 1-2: wheel and drill angles, lifts, squash, glow). Mounted
 * guns add their turret's part ids at the look of their level (#107, #81 acceptance 3). The
 * slices' vehicle pieces report what they hang at attach points under `mounted` (#235): the
 * dynamite rack among them since #215. `rackCharges` is the rack slots the charges fill (#109).
 */
export interface VehiclePartsReport {
  visualTier: number
  gunLevel: number
  /** Null with no rack bolted on. */
  rackCharges: number | null
  partIds: string[]
  poses: Record<string, PartPose>
  /** The attach points a slice's part motion or swap names this tick (#180, sorted). */
  requestedAttach: string[]
  /** What the slices' vehicle pieces hang on the car now, by attach point (#235). */
  mounted: MountedPartsShown[]
}

export interface DebugApi {
  // set state (each one a `debug.*` command)
  setPlanet(planetIndex: number): DebugResult
  setPlanetSeed(planetSeed: number): DebugResult
  teleportToDepthTiles(depthTiles: number): DebugResult
  /** `depthBp` is basis points of the planet's radius (#11): 0 the surface, 10000 the centre. */
  teleportToDepth(depthBp: number): DebugResult
  /**
   * The vehicle at rest in a bay (`sell` unless named, #37), docked, with no tow and no fee
   * (`debug.teleportToDock`).
   */
  teleportToDock(bay?: string): DebugResult
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
  /**
   * One track to an integer level, the stored step `10L + k` since #180 (major 13 is level 130);
   * level 15000 on `drill_tip` is fine (uncapped, #7).
   */
  setUpgrade(upgradeId: string, level: number): DebugResult
  /** Energy in units as a decimal string, a whole number of 1/240 quanta up to the tank. */
  setEnergy(units: string): DebugResult
  /** Hull as a canonical decimal string, at most `hullMax`; 0 destroys the vehicle. */
  setHull(hull: string): DebugResult
  vehicleStats(): DebugResult<VehicleStatsReport>
  /** The art part ids drawn on the run vehicle (placeholders until S7a's export); not logged. */
  vehicleParts(): DebugResult<VehiclePartsReport>
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
  // artefacts (#46): the setter is a `debug.*` command, the read is not logged
  /** The player holds `optionId` (one of the three), as if chosen from this planet's cache. */
  setArtefact(optionId: string): DebugResult
  /** `{ artefactId, breathingRoomCharges, cacheState }` for the local player on this planet. */
  artefact(): DebugResult<ArtefactReport>
  // ground (#36): `debug.*` commands; a disc in mm, `amount` 0 to 255 (default all of it)
  /** Lowers density round `(x, y)` mm; credits no ore and never cuts the dock pad. */
  carveCircle(x: number, y: number, radius: number, amount?: number): DebugResult
  /** Raises density round `(x, y)` mm, up to solid ground. */
  fillCircle(x: number, y: number, radius: number, amount?: number): DebugResult
  // casing (#41): `debug.*` commands
  /** The vehicle's casing grade, a whole number >= 1; grade G holds bands 1 to G. */
  setCasingGrade(grade: number): DebugResult
  /** One ring of lining of `grade` round `(x, y)` mm, the ring the vehicle lays. */
  lineCasing(x: number, y: number, grade: number): DebugResult
  /** Breaches the ring of lining round `(x, y)` mm, as a tunnel wrecker's gnaw does (#111). */
  gnawCasing(x: number, y: number): DebugResult
  // guns (#107): a `debug.*` command
  /** The guns at step `level`: 0 (none), or the mount (10) to the cap (160), no unlock or price. */
  setGunLevel(level: number): DebugResult
  // blasting charges (#109): a `debug.*` command
  /**
   * A bolted-on rack with `slotLevel` (0 to 5) bought slots carrying only `carried` charges of
   * `size` (1, the shipped charge, unless named; K8 #218).
   */
  setCharges(carried: number, slotLevel: number, size?: number): DebugResult
  // heat planets (#113): `debug.*` commands
  /** The lining type the vehicle owns and lays from now on (`standard`, `refractory`), no price. */
  setLiningType(liningType: string): DebugResult
  /** The heat gauge at `heat` whole points, 0 to its max; only 0 off the heat planets. */
  setHeat(heat: number): DebugResult
  // loadout (#162, K4): a `debug.*` command
  /**
   * Replaces the vehicle's loadout: `slots` maps a slot (`powerup.1`-`5`, `drill.head`, `.flank`,
   * `.collar`) to the item it holds, every other slot empty; the vehicle owns exactly those items
   * and `owned` (extractors, cradles). No dock, price or slot lock.
   */
  setVehicleLoadout(slots: Readonly<Record<string, string>>, owned?: readonly string[]): DebugResult
  // collapse (#43): the setter is a `debug.*` command, the read is not logged
  /** Starts the collapse of block `cx,cy#index` now: the full 60-tick warning, then the refill. */
  forceCollapse(block: string): DebugResult
  /** The weak blocks within 16 m of a vehicle and the blocks warning or refilling. */
  collapseState(): DebugResult<CollapseReport>
  // memory (#119): reads, not logged
  /** Rigid bodies and colliders in the running Rapier world, and its WASM memory in bytes. */
  getPhysicsStats(): DebugResult<PhysicsStats>
  // snapshots (#123): not logged, never `debugApplied`
  /**
   * Browser: downloads every kept run's snapshots (saves, screenshots) from IndexedDB as one
   * uncompressed zip, `<runId>/<file>` per entry. Refused in Electron, which writes them into
   * the run folder under `logs/`.
   */
  exportSnapshots(): Promise<DebugResult<SnapshotExport>>
  /** Screens and presentation settings (#33): no command, no log line, never `debugApplied`. */
  ui: DebugUi
  /** Actions pressed at the action layer (#33): their commands are ordinary play. */
  input: DebugInput
  /** Slice debug actions, `features['<slice>'].<action>()` (docs/standards/feature-slices.md 3.14). */
  features: Readonly<Record<string, SliceDebugActions>>
  // stubs
  teleportToCore(): void
  giveResource(resourceTier: number, amount: number): void
  unlock(featureId: string): void
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

function vehiclePartsReport(): VehiclePartsReport {
  const { vehicle, prefs } = game()
  return {
    visualTier: vehicle.visualTier,
    gunLevel: vehicle.gunLevel,
    rackCharges: vehicle.rackCharges,
    partIds: [
      ...vehiclePartIdsOf(SHIPPED_ART, vehicle.visualTier, partMotion.requested.shownPartIds),
      ...gunPartIdsOf(SHIPPED_ART, vehicle.gunLevel),
    ],
    poses: vehiclePartPosesOf(SHIPPED_ART, partMotion, vehicle.visualTier, !prefs.shake),
    requestedAttach: [...partMotion.requested.attach],
    mounted: mountedPartsShown(),
  }
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
    teleportToDock: (bay = 'sell') =>
      runUnlessRefused(vehicleDebugProblems(teleportToDockCommand(bay as BayId)), () =>
        game().teleportToDock(bay as BayId),
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
    vehicleParts: () => ({ ok: true, ...vehiclePartsReport() }),
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
    setArtefact: (optionId) =>
      runUnlessRefused(vehicleDebugProblems(setArtefactCommand(optionId)), () =>
        game().setArtefact(optionId),
      ),
    artefact: () => ({ ok: true, ...readArtefactReport(game().playerId) }),
    carveCircle: (x, y, radius, amount = SOLID_DENSITY) =>
      runUnlessRefused(vehicleDebugProblems(carveCircleCommand({ x, y, radius, amount })), () =>
        game().carveCircle({ x, y, radius, amount }),
      ),
    fillCircle: (x, y, radius, amount = SOLID_DENSITY) =>
      runUnlessRefused(vehicleDebugProblems(fillCircleCommand({ x, y, radius, amount })), () =>
        game().fillCircle({ x, y, radius, amount }),
      ),
    setCasingGrade: (grade) =>
      runUnlessRefused(vehicleDebugProblems(setCasingGradeCommand(grade)), () =>
        game().setCasingGrade(grade),
      ),
    lineCasing: (x, y, grade) =>
      runUnlessRefused(vehicleDebugProblems(lineCasingCommand({ x, y, grade })), () =>
        game().lineCasing({ x, y, grade }),
      ),
    gnawCasing: (x, y) =>
      runUnlessRefused(vehicleDebugProblems(gnawCasingCommand(x, y)), () =>
        game().gnawCasing(x, y),
      ),
    setGunLevel: (level) =>
      runUnlessRefused(vehicleDebugProblems(setGunLevelCommand(level)), () =>
        game().setGunLevel(level),
      ),
    setCharges: (carried, slotLevel, size = 1) =>
      runUnlessRefused(vehicleDebugProblems(setChargesCommand(carried, slotLevel, size)), () =>
        game().setCharges(carried, slotLevel, size),
      ),
    setLiningType: (liningType) =>
      runUnlessRefused(vehicleDebugProblems(setLiningTypeCommand(liningType)), () =>
        game().setLiningType(liningType),
      ),
    setHeat: (heat) =>
      runUnlessRefused(vehicleDebugProblems(setHeatCommand(heat)), () => game().setHeat(heat)),
    setVehicleLoadout: (slots, owned = []) =>
      runUnlessRefused(vehicleDebugProblems(setVehicleLoadoutCommand(slots, owned)), () =>
        setVehicleLoadout(game().playerId, slots, owned),
      ),
    forceCollapse: (block) =>
      runUnlessRefused(vehicleDebugProblems(forceCollapseCommand(block)), () =>
        game().forceCollapse(block),
      ),
    collapseState: () => ({ ok: true, ...readCollapseReport() }),
    getPhysicsStats: readPhysicsStats,
    exportSnapshots: exportSnapshotZip,
    ui: createDebugUi(),
    input: createDebugInput(),
    features: debugActionsBySlice(),
    teleportToCore: notImplemented('teleportToCore'),
    giveResource: notImplemented('giveResource'),
    unlock: notImplemented('unlock'),
  }
}
