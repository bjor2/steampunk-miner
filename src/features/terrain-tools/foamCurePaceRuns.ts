/**
 * The runs behind the foam cure's pace gate (ticket 368; the bot gate of the #157 GD ruling and TD
 * lock): the pacing bot arrives on a planet on-curve and plays to its core twice on each pacing
 * seed, both with foam's every Mark researched (the debug tree grant through planet 60, a Mark
 * every 3 planets), once bare and once with foam in `powerup.1`, pressed at every chance by the
 * magnet hand (`magnetHand.ts`), so each spray cures its cells for good. Only specs use it.
 */
import type { CommandIntent } from '../../systems/authority/authorityCommand'
import { setVehicleLoadoutCommand } from '../../systems/authority/loadoutCommands'
import type { SliceRun } from '../../systems/bot/playSlice'
import { withMagnetHand } from './magnetHand'
import { coreRunOn, MAGNET_PACE_SEEDS } from './magnetPaceRuns'
import { STABILISER_FOAM_ID } from './systems/stabiliserFoam'

/** The TD lock's two runs: P1-P10, and headless P40. */
export const FOAM_CURE_PACE_PLANETS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 40] as const
export const FOAM_CURE_PACE_SEEDS = MAGNET_PACE_SEEDS

/** Far enough down the tree that foam's cure Mark is researched. */
const EVERY_MARK_PLANET = 60

const RESEARCH_EVERY_MARK = {
  type: 'debug.tech-tree.unlockThrough',
  payload: { planetIndex: EVERY_MARK_PLANET },
} as CommandIntent

const BARE_SETUP: readonly CommandIntent[] = [setVehicleLoadoutCommand({}), RESEARCH_EVERY_MARK]

const CURE_SETUP: readonly CommandIntent[] = [
  setVehicleLoadoutCommand({ 'powerup.1': STABILISER_FOAM_ID }),
  RESEARCH_EVERY_MARK,
]

export interface FoamCurePaceRuns {
  planet: number
  seed: number
  bare: SliceRun
  withCure: SliceRun
}

export function foamCurePaceRunsOn(planet: number, seed: number): FoamCurePaceRuns {
  return {
    planet,
    seed,
    bare: coreRunOn(planet, seed, BARE_SETUP, (session) => session),
    withCure: coreRunOn(planet, seed, CURE_SETUP, withMagnetHand),
  }
}

/** How many cells the run's sprays cured. */
export function curedCellsOf(run: SliceRun): number {
  return run.events.reduce(
    (cells, event) => cells + (event.type === 'terrain-tools.FoamCured' ? event.cellsCured : 0),
    0,
  )
}
