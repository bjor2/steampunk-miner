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
import { takeSessionSnapshot, useGameStore, type GameState } from '../store/gameStore'
import { readSnapshot, type SessionSnapshot } from '../systems/authority/sessionSnapshot'
import { fastForwardProblems, type ScriptedCommand } from '../systems/fastForward'
import { validateScenario, type Scenario } from '../systems/scenario'
import { startScenarioProblems } from '../systems/startScenario'

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
  // stubs
  /** `depthBp` is basis points of the radius (#11); the radius arrives with the generator. */
  teleportToDepth(depthBp: number): void
  teleportToCore(): void
  teleportToDock(): void
  giveResource(resourceTier: number, amount: number): void
  setUpgrade(upgradeId: string, level: number): void
  unlock(featureId: string): void
  spawnEnemy(enemyKind: string, tier: number): void
  setVehicleLoadout(loadoutId: string): void
  setCoreFragments(count: number): void
  setFacilityLevel(facilityId: string, level: number): void
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
    teleportToDepth: notImplemented('teleportToDepth'),
    teleportToCore: notImplemented('teleportToCore'),
    teleportToDock: notImplemented('teleportToDock'),
    giveResource: notImplemented('giveResource'),
    setUpgrade: notImplemented('setUpgrade'),
    unlock: notImplemented('unlock'),
    spawnEnemy: notImplemented('spawnEnemy'),
    setVehicleLoadout: notImplemented('setVehicleLoadout'),
    setCoreFragments: notImplemented('setCoreFragments'),
    setFacilityLevel: notImplemented('setFacilityLevel'),
  }
}
