/**
 * The debug/scenario API (design doc sections 19-20): the capabilities a developer, a vitest
 * spec or an AI-driven Playwright test needs to put the game in any state without playing there.
 * The command names follow the doc's examples; the exact API may differ, the capabilities may not.
 *
 * Wired today: setPlanet, setPlanetSeed, teleportToDepth, giveMoney, applyStartScenario.
 * Stubs (typed, throw DebugCommandNotImplementedError) wait for the system they poke.
 */
import { startScenarioProblems, type StartScenario } from '../systems/startScenario'
import { useGameStore } from '../store/gameStore'

export class DebugCommandNotImplementedError extends Error {
  constructor(command: string) {
    super(`debug command "${command}" is not implemented yet (design doc section 19)`)
    this.name = 'DebugCommandNotImplementedError'
  }
}

export interface DebugApi {
  // wired
  setPlanet(planetTier: number): void
  setPlanetSeed(planetSeed: number): void
  teleportToDepth(depth: number): void
  /** `amount` is a decimal string >= 0, for example "1e100" (decision #5). */
  giveMoney(amount: string): void
  applyStartScenario(scenario: StartScenario): void
  startScenarioProblems(scenario: StartScenario): string[]
  // stubs
  teleportToCore(): void
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

export function createDebugApi(): DebugApi {
  const game = () => useGameStore.getState()
  return {
    setPlanet: (planetTier) => game().setPlanet(planetTier),
    setPlanetSeed: (planetSeed) => game().setPlanetSeed(planetSeed),
    teleportToDepth: (depth) => game().teleportToDepth(depth),
    giveMoney: (amount) => game().giveMoney(amount),
    applyStartScenario: (scenario) => game().applyStartScenario(scenario),
    startScenarioProblems,
    teleportToCore: notImplemented('teleportToCore'),
    giveResource: notImplemented('giveResource'),
    setUpgrade: notImplemented('setUpgrade'),
    unlock: notImplemented('unlock'),
    spawnEnemy: notImplemented('spawnEnemy'),
    setVehicleLoadout: notImplemented('setVehicleLoadout'),
    setCoreFragments: notImplemented('setCoreFragments'),
    setFacilityLevel: notImplemented('setFacilityLevel'),
  }
}
