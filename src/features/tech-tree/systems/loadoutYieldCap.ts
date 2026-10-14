/**
 * The loadout yield cap (GD lock on #245, the Vertical Scaler's stacking condition; ticket 266):
 * a full loadout at its last Mark yields no more than today's five lanes at most can, and the
 * Aetheric science lane adds nothing to it. Every aetheric item adds a verb and spends energy or
 * heat, never yield, so a sixth lane may only push yield items out of the five slots, never stack
 * on them.
 *
 * - **Yield** is what the kernel `incomeRates` registry holds (ticket 384): each income item's ore
 *   value a minute reaching the hold at its last Mark, all charges, 100% uptime, clamped to the
 *   trip cap there. A full loadout owns every registered item at once, so its sum bounds every
 *   five-slot pick.
 * - **Today's five-lane maximum** is the same sum over the items outside the Aetheric lane.
 * - **The aetheric contribution** is the rates of the lane's items and of every combo whose
 *   template names the lane; it must be zero, and no such item may carry yield any other way: an
 *   income ladder (#161 `incomeItem`, whose sibling-link Mark is a yield step) or an item hook
 *   that names an income item (decision 9 as amended).
 *
 * Judged at the on-curve vehicle of #161's income-cap planets, P10, P20, P40 and P60, on band 5,
 * the band the tree is priced in and the richest ore. Pure arithmetic per report: never in the
 * authority, so there is no command, event, save section or protocol change.
 */
import { TICKS_PER_SECOND } from '../../../constants/physics'
import { formatAmount } from '../../../systems/displayAmount'
import { oreTier, oreValue } from '../../../systems/economy/oreEconomy'
import { onCurveSteps, vehicleStatsAt } from '../../../systems/economy/vehicleStats'
import {
  add,
  ceilMilli,
  cmp,
  div,
  fromSafeInteger,
  mul,
  ZERO_MONEY,
  type Money,
} from '../../../systems/money'
import {
  incomeCapRowsOf,
  type IncomeAt,
  type IncomeCapRow,
} from '../../../systems/registries/incomeRates'
import type { ItemHook } from '../../../systems/registries/itemHooks'
import { bandDigTicks } from '../../../systems/vehicle/bandDig'
import type { TechLane } from './techNode'
import type { TreeCatalogue } from './techTree'

/** #161's income-cap planets (the Systems amendment of 6 Oct). */
export const LOADOUT_YIELD_PLANETS: readonly number[] = [10, 20, 40, 60]
/** The band the tree is priced in (`tech.costs.band`) and the richest ore of a planet. */
const LOADOUT_YIELD_BAND = 5
const AETHERIC: TechLane = 'aetheric'
const AETHERIC_SLICE_ID = 'aetheric'
const MINUTE_TICKS = fromSafeInteger(60 * TICKS_PER_SECOND)

export interface LoadoutYield {
  planetIndex: number
  /** Every income item outside the Aetheric lane at full stack: today's five-lane maximum. */
  fiveLaneYield: Money
  /** Every income item at full stack, all six lanes: the most any loadout can hold. */
  fullLoadoutYield: Money
  /** The Aetheric lane's items and combos within the full loadout. */
  aethericYield: Money
  /** The full loadout at or under the five-lane maximum, the lane adding nothing. */
  isWithinCap: boolean
}

/** The on-curve vehicle's patch on `planetIndex`'s band 5: its hold and the drill's ore minute. */
export function onCurveIncomeAtOf(planetIndex: number): IncomeAt {
  const levels = onCurveSteps(planetIndex)
  const band = LOADOUT_YIELD_BAND
  const ticksPerCell = bandDigTicks(planetIndex, levels, band)
  if (ticksPerCell === null) throw refusedPatch(planetIndex, band)
  const cellsPerMinute = div(MINUTE_TICKS, fromSafeInteger(ticksPerCell))
  return {
    planetIndex,
    band,
    cargoCapacity: vehicleStatsAt(levels).cargoCapacity,
    drillOrePerMinute: mul(cellsPerMinute, oreValue(oreTier(planetIndex, band))),
  }
}

/** One verdict per income-cap planet, at the on-curve vehicle there. */
export function loadoutYieldsOf(catalogue: TreeCatalogue): LoadoutYield[] {
  return LOADOUT_YIELD_PLANETS.map((planetIndex) =>
    loadoutYieldOf(onCurveIncomeAtOf(planetIndex), catalogue),
  )
}

/** The full loadout against today's five-lane maximum at `at`, every registered item owned. */
export function loadoutYieldOf(at: IncomeAt, catalogue: TreeCatalogue): LoadoutYield {
  const rows = incomeCapRowsOf(at, isEveryAnchorLive)
  return loadoutYieldFrom(at.planetIndex, splitRowsOf(rows, aethericItemIdsOf(catalogue)))
}

/** The verdicts over the cap. */
export function overCapLoadoutsOf(yields: readonly LoadoutYield[]): LoadoutYield[] {
  return yields.filter((loadout) => !loadout.isWithinCap)
}

/**
 * The yield an aetheric item claims outside the rates, one line each: an income ladder, or an
 * item hook naming an income item from the lane or on one of its items.
 */
export function aethericYieldClaimsOf(
  catalogue: TreeCatalogue,
  hooks: readonly ItemHook[],
): string[] {
  return [
    ...incomeLadderClaimsOf(catalogue),
    ...incomeHookClaimsOf(hooks, aethericItemIdsOf(catalogue)),
  ]
}

/** The verdicts as a Markdown table, yields to the money quantum, rounded up. */
export function loadoutYieldTableOf(yields: readonly LoadoutYield[]): string {
  return [
    '| planet | five-lane maximum | full loadout | aetheric | |',
    '|---|---|---|---|---|',
    ...yields.map(
      (loadout) =>
        `| P${loadout.planetIndex} | ${shownOf(loadout.fiveLaneYield)} | ` +
        `${shownOf(loadout.fullLoadoutYield)} | ${shownOf(loadout.aethericYield)} | ` +
        `${loadout.isWithinCap ? '' : 'over the cap'} |`,
    ),
  ].join('\n')
}

/** The income rows of the lane's items apart from the rest. */
interface SplitRows {
  fiveLane: readonly IncomeCapRow[]
  aetheric: readonly IncomeCapRow[]
}

function splitRowsOf(
  rows: readonly IncomeCapRow[],
  aethericItemIds: ReadonlySet<string>,
): SplitRows {
  return {
    fiveLane: rows.filter((row) => !aethericItemIds.has(row.itemId)),
    aetheric: rows.filter((row) => aethericItemIds.has(row.itemId)),
  }
}

function loadoutYieldFrom(planetIndex: number, rows: SplitRows): LoadoutYield {
  const fiveLaneYield = yieldOf(rows.fiveLane)
  const aethericYield = yieldOf(rows.aetheric)
  const fullLoadoutYield = add(fiveLaneYield, aethericYield)
  return {
    planetIndex,
    fiveLaneYield,
    fullLoadoutYield,
    aethericYield,
    isWithinCap: isWithinCap(fullLoadoutYield, fiveLaneYield, aethericYield),
  }
}

/** The lane's items and every combo item whose template pairs the lane. */
function aethericItemIdsOf(catalogue: TreeCatalogue): ReadonlySet<string> {
  const nodeItems = catalogue.nodes
    .filter((node) => node.lane === AETHERIC)
    .map((node) => node.unlocks)
  const comboItems = catalogue.templates
    .filter((template) => template.lanes.includes(AETHERIC))
    .map((template) => template.unlocks)
  return new Set([...nodeItems, ...comboItems])
}

function incomeLadderClaimsOf(catalogue: TreeCatalogue): string[] {
  return catalogue.nodes
    .filter((node) => node.lane === AETHERIC && node.marks?.isIncomeItem === true)
    .map((node) => `${node.unlocks} has an income item's Mark ladder`)
}

function incomeHookClaimsOf(
  hooks: readonly ItemHook[],
  aethericItemIds: ReadonlySet<string>,
): string[] {
  return hooks
    .filter((hook) => isAethericIncomeHook(hook, aethericItemIds))
    .map((hook) => `${hook.id} adds yield toward ${hook.incomeItemId}`)
}

function isAethericIncomeHook(hook: ItemHook, aethericItemIds: ReadonlySet<string>): boolean {
  if (hook.incomeItemId === undefined) return false
  const isOnAethericItem =
    aethericItemIds.has(hook.parentItemId) || aethericItemIds.has(hook.incomeItemId)
  return isOnAethericItem || hook.laneId === AETHERIC_SLICE_ID
}

/** A full loadout owns every item, so every anchor is live. */
function isEveryAnchorLive(): boolean {
  return true
}

function yieldOf(rows: readonly IncomeCapRow[]): Money {
  return rows.map((row) => row.valuePerMinute).reduce(add, ZERO_MONEY)
}

function isWithinCap(full: Money, fiveLane: Money, aetheric: Money): boolean {
  return cmp(full, fiveLane) <= 0 && cmp(aetheric, ZERO_MONEY) === 0
}

function shownOf(amount: Money): string {
  return formatAmount(ceilMilli(amount))
}

function refusedPatch(planetIndex: number, band: number): RangeError {
  return new RangeError(`the on-curve drill cannot cut band ${band} of planet ${planetIndex}`)
}
