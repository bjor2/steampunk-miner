/**
 * The runs behind the twists' pin-6 gate (GD lock on #206 with the Vertical Scaler's conditions;
 * ticket 329 as 206c): the pacing bot arrives on a planet with the on-curve levels, the hull whole
 * and a little money (`paceArrival.ts`, checked), then plays to its core on each pacing seed, one
 * setup sent first in each, all else equal:
 *
 * - **bare:** nothing owned;
 * - **base:** every twist's base item owned, slotted and pressed by the twist hand
 *   (`twistHand.ts`), no twist ("all off");
 * - **one run per twist:** the same with that twist held as the run's one artefact ("all on"; a
 *   twist is the one pick, so the twists never stack, GD decision 3).
 *
 * The bot picks its best card: the twisted run that reaches the core soonest, judged against the
 * base run for time. Each twisted run is judged against the bare run for income, so every twist
 * with its base item stays inside the cap. Only specs use it.
 */
import { PACING_WORLD_SEEDS } from '../../constants/pacingSeeds'
import { TICKS_PER_SECOND } from '../../constants/physics'
import { setArtefactCommand } from '../../systems/artefacts/artefactCommands'
import type { CommandIntent } from '../../systems/authority/authorityCommand'
import type { DomainEvent } from '../../systems/authority/domainEvent'
import { setVehicleLoadoutCommand } from '../../systems/authority/loadoutCommands'
import type { BotSession } from '../../systems/bot/botSession'
import { arrivedPaceSessionOn, playToCoreFrom } from '../../systems/bot/paceArrival'
import type { SliceRun } from '../../systems/bot/playSlice'
import {
  add,
  div,
  floor,
  fromCanonical,
  fromSafeInteger,
  mul,
  toSafeInteger,
  ZERO_MONEY,
  type Money,
} from '../../systems/money'
import { TWISTS } from './systems/twistCatalogue'
import { TWIST_HAND_LOADOUT, TWIST_HAND_OWNED, withTwistHand } from './twistHand'

/** The pin's planets and seeds (83921, 31415 and 27182). */
export const TWIST_PACE_PLANETS = [7, 10] as const
export const TWIST_PACE_SEEDS = PACING_WORLD_SEEDS['bot-slice']

export const BASIS_POINTS = 10000
/** Time to core with the bot's best twist at least 0.98x without it (pin 6). */
export const MIN_TIME_BP = 9800
/** Income per minute of a twist with its base item at most +15% over bare (#162 4.5, pin 6). */
export const MAX_INCOME_BP = 11500

/** Two hours on one planet: room for a slow core on any run. */
const BUDGET_TICKS = 2 * 60 * 60 * TICKS_PER_SECOND
const TICKS_PER_MINUTE = 60 * TICKS_PER_SECOND

export interface TwistedRun {
  optionId: string
  run: SliceRun
}

export interface TwistPaceRuns {
  planet: number
  seed: number
  bare: SliceRun
  base: SliceRun
  twisted: readonly TwistedRun[]
}

/** Every run on `planet` and `seed`: bare, base, and one per twist. */
export function twistPaceRunsOn(planet: number, seed: number): TwistPaceRuns {
  const handed = setVehicleLoadoutCommand(TWIST_HAND_LOADOUT, TWIST_HAND_OWNED)
  const bareSetup = [setVehicleLoadoutCommand({}), setVehicleLoadoutCommand({})]
  return {
    planet,
    seed,
    bare: coreRunOn(planet, seed, bareSetup, (session) => session),
    base: coreRunOn(planet, seed, [handed, handed], withTwistHand),
    twisted: TWISTS.map(({ optionId }) => ({
      optionId,
      run: coreRunOn(planet, seed, [handed, setArtefactCommand(optionId)], withTwistHand),
    })),
  }
}

/** The bot's best card: the twisted run that reaches the core soonest, the first on a tie. */
export function bestTwistedRunOf(runs: TwistPaceRuns): TwistedRun {
  return runs.twisted.reduce((best, next) =>
    coreTicksOf(next.run) < coreTicksOf(best.run) ? next : best,
  )
}

/** Ticks from arrival to the planet's core; the whole budget when the core is never reached. */
export function coreTicksOf(run: SliceRun): number {
  return run.isFinished ? run.state.tick : BUDGET_TICKS
}

/** `run`'s core time over the baseline's, in basis points. */
export function timeRatioBp(run: SliceRun, baseline: SliceRun): number {
  return ratioBp(fromSafeInteger(coreTicksOf(run)), fromSafeInteger(coreTicksOf(baseline)))
}

/** `run`'s sale income per minute over the baseline's, in basis points. */
export function incomeRatioBp(run: SliceRun, baseline: SliceRun): number {
  return ratioBp(incomePerMinuteOf(run), incomePerMinuteOf(baseline))
}

/** How many base item uses the hand's presses resolved in the run. */
export function baseUsesOf(run: SliceRun): number {
  return run.events.filter((event) => event.type === 'power-up-core.PowerUpUsed').length
}

export function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]
}

/** One line per seed, as the Tester reads it in the log. */
export function describeRuns(runs: TwistPaceRuns): string {
  const minutes = (run: SliceRun) => (coreTicksOf(run) / TICKS_PER_MINUTE).toFixed(1)
  const best = bestTwistedRunOf(runs)
  const twisted = runs.twisted
    .map(
      ({ optionId, run }) => `${optionId} ${minutes(run)} min, ${incomeRatioBp(run, runs.bare)} bp`,
    )
    .join('; ')
  const time = `${timeRatioBp(best.run, runs.base)} bp time vs base`
  const head = `P${runs.planet} seed ${runs.seed}: bare ${minutes(runs.bare)}, base ${minutes(runs.base)} min`
  return `${head}; best ${best.optionId} (${time}); ${twisted}; ${baseUsesOf(best.run)} uses`
}

/** The bot from a checked arrival on `planet` to its core, `setup` sent first, through `hand`. */
function coreRunOn(
  planet: number,
  worldSeed: number,
  setup: readonly CommandIntent[],
  hand: (session: BotSession) => BotSession,
): SliceRun {
  const arrived = arrivedPaceSessionOn(planet, worldSeed, setup)
  return playToCoreFrom(hand(arrived), planet, BUDGET_TICKS)
}

/** `value` over `baseline` in whole basis points, rounded down. */
function ratioBp(value: Money, baseline: Money): number {
  return toSafeInteger(floor(mul(div(value, baseline), fromSafeInteger(BASIS_POINTS))))
}

/** Money from every sale of the run over its minutes. */
function incomePerMinuteOf(run: SliceRun): Money {
  const minutes = div(fromSafeInteger(coreTicksOf(run)), fromSafeInteger(TICKS_PER_MINUTE))
  return div(saleIncomeOf(run.events), minutes)
}

function saleIncomeOf(events: readonly DomainEvent[]): Money {
  return events
    .map((event) => (event.type === 'ResourceSold' ? fromCanonical(event.value) : ZERO_MONEY))
    .reduce(add, ZERO_MONEY)
}
