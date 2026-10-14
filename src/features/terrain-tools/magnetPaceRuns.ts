/**
 * The runs behind `balance:magnets` (GD lock on #246, build 6; ticket 287): the pacing bot arrives
 * on a planet with the on-curve levels, the hull whole and a little money, then plays to its core
 * twice on each pacing seed: once with an empty loadout, once with the family granted through the
 * debug loadout (the coil in `powerup.1`, the clamp in `powerup.2`) and pressed by the magnet hand
 * (`magnetHand.ts`). One loadout command goes first in both, all else equal. Only specs use it.
 */
import { PACING_WORLD_SEEDS } from '../../constants/pacingSeeds'
import { TICKS_PER_SECOND } from '../../constants/physics'
import type { CommandIntent } from '../../systems/authority/authorityCommand'
import type { DomainEvent } from '../../systems/authority/domainEvent'
import { setVehicleLoadoutCommand } from '../../systems/authority/loadoutCommands'
import type { BotSession } from '../../systems/bot/botSession'
import { arrivedPaceSessionOn, playToCoreFrom } from '../../systems/bot/paceArrival'
import type { SliceRun } from '../../systems/bot/playSlice'
import { ECONOMY } from '../../systems/economy/economy'
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
import { MAGNET_HAND_LOADOUT, withMagnetHand } from './magnetHand'
import type { MagnetVerb } from './systems/magnetItems'

/** The lock's pace planets: the #205 assert's two. */
export const MAGNET_PACE_PLANETS = [7, 10] as const
/** 83921, 31415 and 27182. */
export const MAGNET_PACE_SEEDS = PACING_WORLD_SEEDS['bot-slice']

/** Ratios in basis points of the bare run's, judged on the median of the seeds (#84). */
export const BASIS_POINTS = 10000
/** Time to core with the family at least 0.98x without it (GD lock on #246). */
export const MIN_TIME_BP = 9800
/** Income per minute with the family at most +15%: the family's income cap (#246). */
export const MAX_INCOME_BP = BASIS_POINTS + ECONOMY.magnets.incomeCapBp

/** Two hours on one planet: room for a slow core on either run. */
const BUDGET_TICKS = 2 * 60 * 60 * TICKS_PER_SECOND
const TICKS_PER_MINUTE = 60 * TICKS_PER_SECOND

const BARE_LOADOUT = setVehicleLoadoutCommand({})
const MAGNET_LOADOUT = setVehicleLoadoutCommand(MAGNET_HAND_LOADOUT)

export interface MagnetPaceRuns {
  planet: number
  seed: number
  bare: SliceRun
  withMagnets: SliceRun
}

/** Both runs on `planet` and `seed`. */
export function magnetPaceRunsOn(planet: number, seed: number): MagnetPaceRuns {
  return {
    planet,
    seed,
    bare: coreRunOn(planet, seed, BARE_LOADOUT, (session) => session),
    withMagnets: coreRunOn(planet, seed, MAGNET_LOADOUT, withMagnetHand),
  }
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

/** How many `magnet_used` acts the run logged for `verb`. */
export function magnetUsesOf(run: SliceRun, verb: MagnetVerb): number {
  return run.events.filter((event) => isMagnetUseOf(event, verb)).length
}

export function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]
}

/** One line per run pair, as the Tester reads it in the log. */
export function describeRuns({ planet, seed, bare, withMagnets }: MagnetPaceRuns): string {
  const minutes = (run: SliceRun) => (coreTicksOf(run) / TICKS_PER_MINUTE).toFixed(1)
  const ratios = `${timeRatioBp(withMagnets, bare)} bp time, ${incomeRatioBp(withMagnets, bare)} bp income`
  const uses = `${magnetUsesOf(withMagnets, 'repel')} waves, ${magnetUsesOf(withMagnets, 'anchor')} clamps`
  return `P${planet} seed ${seed}: bare ${minutes(bare)} min, magnets ${minutes(withMagnets)} min (${ratios}; ${uses})`
}

/** The bot from arrival on `planet` (`paceArrival.ts`) to its core, `setup` first, via `hand`. */
export function coreRunOn(
  planet: number,
  worldSeed: number,
  setup: CommandIntent | readonly CommandIntent[],
  hand: (session: BotSession) => BotSession,
): SliceRun {
  const arrived = arrivedPaceSessionOn(planet, worldSeed, [setup].flat())
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

function isMagnetUseOf(event: DomainEvent, verb: MagnetVerb): boolean {
  return event.type === 'terrain-tools.MagnetUsed' && event.verb === verb
}
