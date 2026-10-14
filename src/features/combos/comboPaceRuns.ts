/**
 * The runs behind the combos' pin-6 gate (GD lock on #206 with the Vertical Scaler's conditions;
 * ticket 206): the pacing bot arrives on a planet with the on-curve levels, the hull whole and a
 * little money (`paceArrival.ts`, checked), then plays to its core three times on each pacing
 * seed, one loadout command sent first in each, all else equal:
 *
 * - **bare:** nothing owned;
 * - **parents:** every shipped combo's parent items owned, the drain, the ore-shifter and the corer
 *   slotted and pressed by the combo hand (`comboHand.ts`), no combo;
 * - **combos:** the same with every shipped combo owned too ("all on").
 *
 * The combos run against the parents run isolates what the combos add to pace; against the bare
 * run it bounds the income the combos and their parents add together. The alarm shield's two runs
 * slot the steam shield with everything scheduled researched and the one auto switch on, pressed by
 * hand on every lunge warning without the combo, or acting on its own with it. Only specs use it.
 */
import { PACING_WORLD_SEEDS } from '../../constants/pacingSeeds'
import { TICKS_PER_SECOND } from '../../constants/physics'
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
import { STEAM_SEAR_ITEM_ID } from '../../systems/authority/bore/boreFire'
import { contentOf } from '../../systems/registries/content'
import { COMBO_HAND_LOADOUT, SHIELD_HAND_LOADOUT, withComboHand, withShieldHand } from './comboHand'
import { SHIPPED_COMBOS } from './systems/comboContent'

/** The pin's planets and seeds (83921, 31415 and 27182). */
export const COMBO_PACE_PLANETS = [7, 10] as const
export const COMBO_PACE_SEEDS = PACING_WORLD_SEEDS['bot-slice']

export const BASIS_POINTS = 10000
/** Time to core with every combo at least 0.98x without them (pin 6). */
export const MIN_TIME_BP = 9800
/** Income per minute of the combos and their parents at most +15% (#162 4.5, pin 6). */
export const MAX_INCOME_BP = 11500

/** Two hours on one planet: room for a slow core on any run. */
const BUDGET_TICKS = 2 * 60 * 60 * TICKS_PER_SECOND
const TICKS_PER_MINUTE = 60 * TICKS_PER_SECOND

const SHIELD_ID = 'power.steam_shield'
const ALARM_SHIELD_ID = 'combo.alarm_shield'
/** Everything the campaign schedules researched in both shield runs, the sear's node included. */
const SCHEDULED_PLANETS = 40
const SEAR_AUTO_ON: CommandIntent = { type: 'ground_gun.set_auto', payload: { on: true } }

const SHIPPED_IDS = SHIPPED_COMBOS.map((item) => item.itemId)
const PARENT_IDS = [...new Set(SHIPPED_COMBOS.flatMap((item) => item.parentItemIds))]

export interface ComboPaceRuns {
  planet: number
  seed: number
  bare: SliceRun
  parents: SliceRun
  combos: SliceRun
}

/** The three runs on `planet` and `seed`. */
export function comboPaceRunsOn(planet: number, seed: number): ComboPaceRuns {
  const handed = setVehicleLoadoutCommand(COMBO_HAND_LOADOUT, PARENT_IDS)
  const allOn = setVehicleLoadoutCommand(COMBO_HAND_LOADOUT, [...PARENT_IDS, ...SHIPPED_IDS])
  return {
    planet,
    seed,
    bare: coreRunOn(planet, seed, setVehicleLoadoutCommand({}), (session) => session),
    parents: coreRunOn(planet, seed, handed, withComboHand),
    combos: coreRunOn(planet, seed, allOn, withComboHand),
  }
}

/** The alarm shield's two runs on a planet and seed: pressed by hand, and acting on its own. */
export interface ShieldPaceRuns {
  planet: number
  seed: number
  manual: SliceRun
  auto: SliceRun
}

/**
 * Both shield runs: the steam shield slotted and everything through planet 40 researched in each,
 * the one auto switch on in each; by hand on every lunge warning without the combo, on its own
 * with the alarm shield owned and nobody pressing.
 */
export function shieldPaceRunsOn(planet: number, seed: number): ShieldPaceRuns {
  return {
    planet,
    seed,
    manual: shieldRunOn(planet, seed, [SHIELD_ID], withShieldHand),
    auto: shieldRunOn(planet, seed, [SHIELD_ID, ALARM_SHIELD_ID], (session) => session),
  }
}

/** The auto run alone, to replay it for the host and guest check. */
export function autoShieldRunOn(planet: number, seed: number): SliceRun {
  return shieldRunOn(planet, seed, [SHIELD_ID, ALARM_SHIELD_ID], (session) => session)
}

/** Whether a registered node researches the steam sear, whose toggle switches the shield (#318). */
export function isShieldAutoSwitchable(): boolean {
  return contentOf('tech-node').some((node) => node.unlocks === STEAM_SEAR_ITEM_ID)
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

/** How many uses of a partner item the hand's presses resolved in the run. */
export function partnerUsesOf(run: SliceRun): number {
  return run.events.filter((event) => event.type === 'power-up-core.PowerUpUsed').length
}

export function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]
}

/** One line per seed, as the Tester reads it in the log. */
export function describeRuns({ planet, seed, bare, parents, combos }: ComboPaceRuns): string {
  const minutes = (run: SliceRun) => (coreTicksOf(run) / TICKS_PER_MINUTE).toFixed(1)
  const time = `${timeRatioBp(combos, parents)} bp time vs parents`
  const income = `${incomeRatioBp(combos, bare)} bp income vs bare`
  const runs = `bare ${minutes(bare)}, parents ${minutes(parents)}, combos ${minutes(combos)} min`
  return `P${planet} seed ${seed}: ${runs} (${time}, ${income}; ${partnerUsesOf(combos)} uses)`
}

function shieldRunOn(
  planet: number,
  worldSeed: number,
  owned: readonly string[],
  hand: (session: BotSession) => BotSession,
): SliceRun {
  const setup = [
    { type: 'debug.tech-tree.unlockThrough', payload: { planetIndex: SCHEDULED_PLANETS } },
    setVehicleLoadoutCommand(SHIELD_HAND_LOADOUT, owned),
    SEAR_AUTO_ON,
  ] as CommandIntent[]
  return coreRunOn(planet, worldSeed, setup, hand)
}

/** The bot from a checked arrival on `planet` to its core, `setup` sent first, through `hand`. */
function coreRunOn(
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
