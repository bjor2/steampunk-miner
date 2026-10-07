/**
 * Spec plumbing for the drill-gear pace asserts (Vertical Scaler on #205, the twin-bit head's on
 * #257): the pacing bot arriving on a planet with the on-curve levels and a little money, then
 * playing to that planet's core with a chosen gear setup. Only specs use it.
 */
import { PACING_WORLD_SEEDS } from '../../constants/pacingSeeds'
import { TICKS_PER_SECOND } from '../../constants/physics'
import type { CommandIntent } from '../../systems/authority/authorityCommand'
import { createAuthorityState } from '../../systems/authority/authorityState'
import { playSlice, type SliceRun } from '../../systems/bot/playSlice'
import { UPGRADE_IDS } from '../../systems/economy/economyDefinition'
import { stepOfMajor } from '../../systems/economy/upgradeSteps'
import { onCurveLevel } from '../../systems/economy/vehicleStats'
import { setPlanetCommand, setPlanetSeedCommand } from '../../systems/startScenarioCommands'
import { setUpgradeCommand } from '../../systems/vehicle/vehicleCommands'

export const PACE_PLANETS = [7, 10] as const
export const PACE_SEEDS = PACING_WORLD_SEEDS['bot-slice']
/** The #205 assert: with the gear, at least 0.98x the bare time (median of the seeds, #84). */
export const MIN_PACE_RATIO = 0.98
/** Two hours on one planet: room for a slow core on either run. */
const BUDGET_TICKS = 2 * 60 * 60 * TICKS_PER_SECOND
const ARRIVAL_MONEY = '20000'

/** On `planet` with the on-curve levels and a little money, as a bot arriving there. */
function arrivalOn(planet: number, worldSeed: number): CommandIntent[] {
  return [
    setPlanetCommand(planet),
    setPlanetSeedCommand(worldSeed),
    { type: 'debug.setMoney', payload: { amount: ARRIVAL_MONEY } },
    ...UPGRADE_IDS.map((id) => setUpgradeCommand(id, stepOfMajor(onCurveLevel(id, planet)))),
  ]
}

/** The bot from arrival on `planet` to its core, with `gear` sent before the first trip. */
export function coreRunOn(
  planet: number,
  worldSeed: number,
  gear: readonly CommandIntent[],
): SliceRun {
  const start = createAuthorityState({ planetIndex: 1, planetSeed: worldSeed, playerIds: ['p1'] })
  return playSlice(start, {
    maxTicks: BUDGET_TICKS,
    lastPlanet: planet,
    startCommands: [...arrivalOn(planet, worldSeed), ...gear],
  })
}

/** Ticks from arrival to the planet's core; the whole budget when the core is never reached. */
export function coreTicksOf(run: SliceRun): number {
  return run.isFinished ? run.state.tick : BUDGET_TICKS
}

export function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]
}
