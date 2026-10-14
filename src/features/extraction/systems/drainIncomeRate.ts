/**
 * The mineral drain's rate for the kernel's 15% income-cap check (#385, TD lock "K-ir" on #212):
 * a minute of uses at a Mark, every charge spent, each use finding the band's richest ore in reach
 * (its ore with the +2 lead, #140: an upper bound) and paying what reaches the hold under the trip
 * cap and the hold's room. The same arithmetic judged #201 Q3 (`drainPerMinute.test.ts`).
 *
 * The drain is a tree item that no `stats.json` row admits, so it anchors on itself and counts once
 * owned.
 */
import { TICKS_PER_SECOND } from '../../../constants/physics'
import { oreTier } from '../../../systems/economy/oreEconomy'
import { add, ZERO_MONEY, type Money } from '../../../systems/money'
import type { IncomeAt, IncomeRate } from '../../../systems/registries/incomeRates'
import { lastMarkOf, markStepOf } from '../../tech-tree'
import { takeDrainCells } from './drainTake'
import { MINERAL_DRAIN } from './extractionContent'
import { EXTRACTION_ECONOMY } from './extractionEconomy'
import { markLadderOf } from './extractionItems'
import { roomUnderCapOf, tripCapAt } from './tripCap'

const MINUTE_TICKS = 60 * TICKS_PER_SECOND
/** The richest cells a band holds: its ore with the +2 lead (#140). */
const RICHEST_LEAD = 2

/** The drain at one Mark: its cells per use and its most uses in a minute. */
export interface DrainAtMark {
  mark: number
  cellsPerUse: number
  usesPerMinute: number
}

export const DRAIN_INCOME_RATE: IncomeRate = {
  id: 'extraction.mineral_drain',
  itemId: MINERAL_DRAIN.itemId,
  anchorRowId: MINERAL_DRAIN.itemId,
  valuePerMinuteAtFullStack: drainAtLastMarkForAMinute,
}

/** The drain's cells per use and its most uses in a minute, Mark 1 to Mastered. */
export function drainAtEveryMark(): DrainAtMark[] {
  const lastMark = lastMarkOf(markLadderOf(MINERAL_DRAIN))
  return Array.from({ length: lastMark }, (_, index) => drainAtMark(index + 1))
}

/** A minute of uses, each finding the band's richest ore in reach and the trip carried on. */
export function drainForAMinute(
  drain: DrainAtMark,
  planet: number,
  band: number,
  hold: number,
): Money {
  const cap = tripCapAt(planet, band, hold)
  const cells = richestCellsOf(planet, band, drain.cellsPerUse)
  let moved = ZERO_MONEY
  let carry = ZERO_MONEY
  for (let use = 0; use < drain.usesPerMinute; use++) {
    const take = takeDrainCells(cells, {
      maxCells: drain.cellsPerUse,
      room: roomUnderCapOf(moved, cap),
      holdRoom: hold,
      yieldShare: EXTRACTION_ECONOMY.income.yieldShare,
      yieldCarry: carry,
    })
    moved = add(moved, take.value)
    carry = take.yieldCarry
  }
  return moved
}

function drainAtLastMarkForAMinute(at: IncomeAt): Money {
  const drain = drainAtMark(lastMarkOf(markLadderOf(MINERAL_DRAIN)))
  return drainForAMinute(drain, at.planetIndex, at.band, at.cargoCapacity)
}

function drainAtMark(mark: number): DrainAtMark {
  const { stats } = markStepOf(markLadderOf(MINERAL_DRAIN), mark)
  const charges = stats.charges as number
  const cooldown = stats.cooldown as number
  return {
    mark,
    cellsPerUse: stats.magnitude as number,
    usesPerMinute: Math.min(charges, 1 + Math.floor(MINUTE_TICKS / cooldown)),
  }
}

function richestCellsOf(planet: number, band: number, count: number) {
  const tier = oreTier(planet, band) + RICHEST_LEAD
  const ore = {
    resourceTier: tier,
    saleTier: tier,
    oreId: `kernel.metal.t${tier}`,
    depthTiles: 3,
    chunk: '0,0',
  }
  return Array.from({ length: count }, (_, tx) => ({ tile: { tx, ty: 0 }, ore }))
}
