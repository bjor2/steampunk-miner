import { describe, expect, it } from 'vitest'
import { oreTier } from '../../../systems/economy/oreEconomy'
import {
  add,
  cmp,
  fromCanonical,
  fromSafeInteger,
  toCanonical,
  ZERO_MONEY,
  type Money,
} from '../../../systems/money'
import type { MinedOre } from '../../../systems/authority/minedOre'
import type { DrainableCell } from './drainReach'
import { paidCountOf, takeDrainCells, type DrainLimits } from './drainTake'
import { EXTRACTION_ECONOMY } from './extractionEconomy'
import { roomUnderCapOf, tripCapAt } from './tripCap'

// Which cells one drain takes (#162 4.5): half of each cell's ore reaches the hold, the share owed
// carrying from cell to cell, and the hard clamp stops the use before a unit would pass the trip
// cap or the hold.

const HALF = EXTRACTION_ECONOMY.income.yieldShare

function oreOfTier(saleTier: number): MinedOre {
  return {
    resourceTier: saleTier,
    saleTier,
    oreId: `kernel.metal.t${saleTier}`,
    depthTiles: 3,
    chunk: '0,0',
  }
}

function cellsOfTier(count: number, saleTier: number): DrainableCell[] {
  return Array.from({ length: count }, (_, tx) => ({
    tile: { tx, ty: 0 },
    ore: oreOfTier(saleTier),
  }))
}

function limitsOf(change: Partial<DrainLimits> = {}): DrainLimits {
  return {
    maxCells: 6,
    room: fromCanonical('1e+9'),
    holdRoom: 100,
    yieldShare: HALF,
    yieldCarry: ZERO_MONEY,
    ...change,
  }
}

const text = (amount: Money) => toCanonical(amount)

describe('drain take', () => {
  it('takes at most its cells per use, nearest first, and pays every second cell', () => {
    const take = takeDrainCells(cellsOfTier(9, 1), limitsOf())
    expect(take.taken.map((cell) => cell.tile.tx)).toEqual([0, 1, 2, 3, 4, 5])
    expect(take.taken.map((cell) => cell.isPaid)).toEqual([false, true, false, true, false, true])
    expect(text(take.value)).toBe(text(fromSafeInteger(30)))
    expect(take.stoppedBy).toBeNull()
  })

  it('carries a half unit owed into the next use, so a lone cell pays on the second use', () => {
    const first = takeDrainCells(cellsOfTier(1, 1), limitsOf())
    expect(paidCountOf(first)).toBe(0)
    expect(text(first.yieldCarry)).toBe(text(HALF))
    const second = takeDrainCells(cellsOfTier(1, 1), limitsOf({ yieldCarry: first.yieldCarry }))
    expect(paidCountOf(second)).toBe(1)
    expect(text(second.yieldCarry)).toBe('0e+0')
  })

  it('stops before the unit that would pass the trip cap, keeping the cells before it', () => {
    const take = takeDrainCells(cellsOfTier(6, 1), limitsOf({ room: fromSafeInteger(15) }))
    expect(take.taken).toHaveLength(3)
    expect(paidCountOf(take)).toBe(1)
    expect(take.stoppedBy).toBe('trip_cap')
  })

  it('takes nothing when the first paid unit would pass the cap', () => {
    const take = takeDrainCells(
      cellsOfTier(6, 1),
      limitsOf({ room: fromSafeInteger(9), yieldCarry: HALF }),
    )
    expect(take.taken).toEqual([])
    expect(take.stoppedBy).toBe('trip_cap')
  })

  it('stops at the unit the hold has no room for', () => {
    const take = takeDrainCells(cellsOfTier(6, 1), limitsOf({ holdRoom: 1 }))
    expect(paidCountOf(take)).toBe(1)
    expect(take.stoppedBy).toBe('hold')
  })

  it('never moves more than the trip cap on any planet from 1 to 40 and any band, however many uses', () => {
    const overruns: string[] = []
    for (let planet = 1; planet <= 40; planet++) {
      for (let band = 1; band <= 5; band++) {
        const moved = drainUntilRefused(planet, band)
        if (cmp(moved, tripCapAt(planet, band, 24)) > 0) overruns.push(`P${planet} band ${band}`)
      }
    }
    expect(overruns).toEqual([])
  })
})

/**
 * Drains a hold of 24 units with uses of six cells of the band's ore and its +2 leads, carrying the
 * trip from use to use until a use takes nothing, and answers what the trip moved.
 */
function drainUntilRefused(planet: number, band: number): Money {
  const cap = tripCapAt(planet, band, 24)
  const tiers = [0, 2, 1, 0, 2, 0].map((lead) => oreTier(planet, band) + lead)
  const cells = tiers.map((tier, tx) => ({ tile: { tx, ty: 0 }, ore: oreOfTier(tier) }))
  let moved = ZERO_MONEY
  let carry = ZERO_MONEY
  for (let use = 0; use < 100; use++) {
    const take = takeDrainCells(
      cells,
      limitsOf({ room: roomUnderCapOf(moved, cap), yieldCarry: carry }),
    )
    if (take.taken.length === 0) break
    moved = add(moved, take.value)
    carry = take.yieldCarry
  }
  return moved
}
