/**
 * The game store: what the UI renders and the actions that change it. One writer for this
 * slice. Per-frame state (vehicle position, velocity) does NOT live here; it stays in the physics
 * body and refs.
 *
 * Every action here is a scenario/debug command so far, so each records `debug_command_applied`
 * (design doc sections 19-22). Gameplay actions (drill, sell, buy) arrive with their own events.
 */
import { create } from 'zustand'
import { getRunLog } from '../logging/runLog'
import type { RunEventContext } from '../logging/runEvent'
import { startScenarioProblems, type StartScenario } from '../systems/startScenario'

export interface GameState {
  playerId: string
  planetTier: number
  planetSeed: number
  /** Fraction of the way from the surface (0) to the core (1). */
  depth: number
  money: number

  setPlanet(planetTier: number): void
  setPlanetSeed(planetSeed: number): void
  teleportToDepth(depth: number): void
  giveMoney(amount: number): void
  applyStartScenario(scenario: StartScenario): void
}

type GameValues = Pick<GameState, 'playerId' | 'planetTier' | 'planetSeed' | 'depth' | 'money'>

export const STARTING_VALUES: GameValues = {
  playerId: 'player_1',
  planetTier: 0,
  planetSeed: 1,
  depth: 0,
  money: 0,
}

export const useGameStore = create<GameState>()((set, get) => ({
  ...STARTING_VALUES,

  setPlanet: (planetTier) => {
    refuseProblems(startScenarioProblems({ planetTier }))
    set({ planetTier, depth: 0 })
    recordDebugCommand(get(), 'setPlanet', { planetTier })
  },

  setPlanetSeed: (planetSeed) => {
    refuseProblems(startScenarioProblems({ planetSeed }))
    set({ planetSeed })
    recordDebugCommand(get(), 'setPlanetSeed', { planetSeed })
  },

  teleportToDepth: (depth) => {
    refuseProblems(startScenarioProblems({ depth }))
    set({ depth })
    recordDebugCommand(get(), 'teleportToDepth', { depth })
  },

  giveMoney: (amount) => {
    refuseProblems(startScenarioProblems({ money: amount }))
    set((state) => ({ money: state.money + amount }))
    recordDebugCommand(get(), 'giveMoney', { amount })
  },

  applyStartScenario: (scenario) => {
    refuseProblems(startScenarioProblems(scenario))
    set(scenario)
    recordDebugCommand(get(), 'applyStartScenario', { ...scenario })
  },
}))

/** Back to a fresh run; tests call this in beforeEach. */
export function resetGameStore(): void {
  useGameStore.setState({ ...STARTING_VALUES })
}

/** Where in the world the player is, for stamping events. */
export function runEventContextOf(state: GameValues): RunEventContext {
  return {
    playerId: state.playerId,
    planet: state.planetTier,
    planetSeed: state.planetSeed,
    depth: state.depth,
  }
}

/** A scenario is refused, never trimmed: every problem is named, nothing is applied. */
function refuseProblems(problems: string[]): void {
  if (problems.length > 0) throw new Error(problems.join('; '))
}

function recordDebugCommand(
  state: GameValues,
  command: string,
  args: Record<string, unknown>,
): void {
  getRunLog().record(runEventContextOf(state), 'debug_command_applied', { command, args })
}
