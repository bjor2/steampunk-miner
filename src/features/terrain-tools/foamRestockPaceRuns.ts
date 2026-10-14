/**
 * The runs behind the shared collapse-delay pace gate with foam restocked (ticket 394, the VS
 * condition of the GD ruling on #381, option c): the pacing bot arrives on a planet on-curve and
 * plays to its core twice on each pacing seed, both with every Mark researched (the debug tree
 * grant through planet 60, as the cure's gate has it):
 *
 * - **never-foam**: an empty loadout and the gun never fired, the bot as it plays today;
 * - **holders**: every ground holder owned together. Foam in `powerup.1` and the lode clamp in
 *   `powerup.2`, pressed at every chance by the magnet hand (`magnetHand.ts`); foam at its
 *   mastered Mark, so each spray also cures its cells, the reinforcement (ticket 368); the
 *   refractory lining, the casing-cement grade that reinforces what it lines (ticket 367); the bore
 *   gun mounted at its walls and fired at every chance (`balance:bore`'s forced run, ticket 347);
 *   and foam restocked at every Upgrade bay visit by the restock hand (`restockHand.ts`), so the
 *   stack never runs dry. Only specs use it.
 */
import type { CommandIntent } from '../../systems/authority/authorityCommand'
import { setVehicleLoadoutCommand } from '../../systems/authority/loadoutCommands'
import { mountBoreGunWhenForced } from '../../systems/bot/botBore'
import type { BotSession } from '../../systems/bot/botSession'
import { botPlanetOf } from '../../systems/bot/botTravel'
import { arrivedPaceSessionOn } from '../../systems/bot/paceArrival'
import { playSliceFrom, type SliceRun } from '../../systems/bot/playSlice'
import { withMagnetHand } from './magnetHand'
import { BUDGET_TICKS, coreRunOn, MAGNET_PACE_SEEDS } from './magnetPaceRuns'
import { withRestockHand } from './restockHand'
import { LODE_CLAMP_ID } from './systems/lodeClamp'
import { STABILISER_FOAM_ID } from './systems/stabiliserFoam'

/** P1-P10 and P40 at the re-baseline, as the cure's gate plays them. */
export const FOAM_RESTOCK_PACE_PLANETS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 40] as const
export const FOAM_RESTOCK_PACE_SEEDS = MAGNET_PACE_SEEDS

/** Far enough down the tree that foam's cure Mark is researched. */
const EVERY_MARK_PLANET = 60

const RESEARCH_EVERY_MARK = {
  type: 'debug.tech-tree.unlockThrough',
  payload: { planetIndex: EVERY_MARK_PLANET },
} as CommandIntent

const NEVER_FOAM_SETUP: readonly CommandIntent[] = [
  setVehicleLoadoutCommand({}),
  RESEARCH_EVERY_MARK,
]

const HOLDERS_SETUP: readonly CommandIntent[] = [
  setVehicleLoadoutCommand({ 'powerup.1': STABILISER_FOAM_ID, 'powerup.2': LODE_CLAMP_ID }),
  { type: 'debug.setLiningType', payload: { liningType: 'refractory' } },
  RESEARCH_EVERY_MARK,
]

export interface FoamRestockPaceRuns {
  planet: number
  seed: number
  neverFoam: SliceRun
  withHolders: SliceRun
}

export function foamRestockPaceRunsOn(planet: number, seed: number): FoamRestockPaceRuns {
  return {
    planet,
    seed,
    neverFoam: coreRunOn(planet, seed, NEVER_FOAM_SETUP, (session) => session),
    withHolders: holdersRunOn(planet, seed),
  }
}

/** How many charges of foam the run bought back. */
export function foamRestockedOf(run: SliceRun): number {
  return run.events.reduce(
    (charges, event) =>
      charges + (event.type === 'power-up-core.ConsumableRestocked' ? event.count : 0),
    0,
  )
}

/** The bot to `planet`'s core with every holder owned, the gun forced and foam restocked. */
function holdersRunOn(planet: number, seed: number): SliceRun {
  const session = holdersHandOf(arrivedPaceSessionOn(planet, seed, HOLDERS_SETUP))
  mountBoreGunWhenForced(session, 'forced')
  const botPlanet = botPlanetOf(session, 'blast', [], 'forced')
  return playSliceFrom(session, botPlanet, { maxTicks: BUDGET_TICKS, lastPlanet: planet })
}

function holdersHandOf(arrived: BotSession): BotSession {
  return withRestockHand(withMagnetHand(arrived), [STABILISER_FOAM_ID])
}
