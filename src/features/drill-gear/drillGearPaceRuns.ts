/**
 * Spec plumbing for the drill-gear pace asserts (Vertical Scaler on #205, the twin-bit head's on
 * #257): the pacing bot arriving on a planet with the on-curve levels, the hull whole and a little
 * money (`paceArrival.ts`, ticket 356), then playing to that planet's core with a chosen gear setup.
 * Only specs use it.
 */
import { PACING_WORLD_SEEDS } from '../../constants/pacingSeeds'
import { TICKS_PER_SECOND } from '../../constants/physics'
import type { CommandIntent } from '../../systems/authority/authorityCommand'
import { arrivedPaceSessionOn, playToCoreFrom } from '../../systems/bot/paceArrival'
import type { SliceRun } from '../../systems/bot/playSlice'

export const PACE_PLANETS = [7, 10] as const
export const PACE_SEEDS = PACING_WORLD_SEEDS['bot-slice']
/** The #205 ratio, 0.98 on the median of the seeds (#84); each spec says which way it reads. */
export const MIN_PACE_RATIO = 0.98
/** Two hours on one planet: room for a slow core on either run. */
const BUDGET_TICKS = 2 * 60 * 60 * TICKS_PER_SECOND

/** The bot from arrival on `planet` to its core, with `gear` sent before the first trip. */
export function coreRunOn(
  planet: number,
  worldSeed: number,
  gear: readonly CommandIntent[],
): SliceRun {
  return playToCoreFrom(arrivedPaceSessionOn(planet, worldSeed, gear), planet, BUDGET_TICKS)
}

/** Ticks from arrival to the planet's core; the whole budget when the core is never reached. */
export function coreTicksOf(run: SliceRun): number {
  return run.isFinished ? run.state.tick : BUDGET_TICKS
}

export function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]
}
