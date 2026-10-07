/**
 * Which drainable cells one use takes (#162 4.5): in reach order, at most the item's cells per
 * use, and each taken cell turns to plain ground. Half of each cell's ore reaches the hold: the
 * hold counts whole units, so the share owed carries from cell to cell (and use to use, until the
 * dock), and a unit is paid on the cell that completes it.
 *
 * The clamp is hard: the use takes cells until the next would pay a unit past the trip cap or past
 * the hold's room, and stops there. A use that took nothing says which limit stopped it.
 */
import { oreSalePrice } from '../../../systems/economy/oreEconomy'
import { add, cmp, fromSafeInteger, sub, ZERO_MONEY, type Money } from '../../../systems/money'
import type { DrainableCell } from './drainReach'

const ONE_UNIT = fromSafeInteger(1)

/** The trip as the use finds it, and what it may take. */
export interface DrainLimits {
  maxCells: number
  /** What the income items may still move this trip. */
  room: Money
  /** Free units in the hold. */
  holdRoom: number
  yieldShare: Money
  /** The share of a unit owed from the trip's earlier cells. */
  yieldCarry: Money
}

/** One taken cell: it fades to plain ground, and it pays a unit of `ore` when `isPaid`. */
export interface TakenCell extends DrainableCell {
  isPaid: boolean
}

export interface DrainTake {
  taken: readonly TakenCell[]
  /** What the paid units are worth. */
  value: Money
  yieldCarry: Money
  /** What stopped the use short of its cells, or null when it ran out of cells or took its fill. */
  stoppedBy: 'trip_cap' | 'hold' | null
}

export function takeDrainCells(cells: readonly DrainableCell[], limits: DrainLimits): DrainTake {
  let take: DrainTake = {
    taken: [],
    value: ZERO_MONEY,
    yieldCarry: limits.yieldCarry,
    stoppedBy: null,
  }
  for (const cell of cells.slice(0, limits.maxCells)) {
    const next = takenWith(take, cell, limits)
    if (next.stoppedBy !== null) return next
    take = next
  }
  return take
}

/** The take with `cell` added, or the take as it was, stopped by the limit the cell would pass. */
function takenWith(take: DrainTake, cell: DrainableCell, limits: DrainLimits): DrainTake {
  const owed = add(take.yieldCarry, limits.yieldShare)
  const isPaid = cmp(owed, ONE_UNIT) >= 0
  if (!isPaid) return { ...take, taken: [...take.taken, { ...cell, isPaid }], yieldCarry: owed }
  const value = add(take.value, oreSalePrice(cell.ore.saleTier))
  if (cmp(value, limits.room) > 0) return { ...take, stoppedBy: 'trip_cap' }
  if (paidCountOf(take) >= limits.holdRoom) return { ...take, stoppedBy: 'hold' }
  return {
    taken: [...take.taken, { ...cell, isPaid }],
    value,
    yieldCarry: sub(owed, ONE_UNIT),
    stoppedBy: null,
  }
}

export function paidCountOf(take: Pick<DrainTake, 'taken'>): number {
  return take.taken.filter((cell) => cell.isPaid).length
}
