import { describe, expect, it } from 'vitest'
import {
  cmp,
  fromCanonical,
  fromSafeInteger,
  toCanonical,
  ZERO_MONEY,
} from '../../../systems/money'
import type { SeenRarity } from '../../../systems/render/seenRarity'
import type { HeldKind } from './heldManifest'
import { RECEIPT } from './receiptData'
import {
  isRollDone,
  rarityGroupsOf,
  receiptWithSale,
  rolledTotalAt,
  rollStepAt,
  tripCompareOf,
  type ReceiptSale,
  type TripReceipt,
} from './tripReceipt'

const RARE: SeenRarity = { lead: 2, rarity: 'rare', tint: [0.2, 0.4, 1], pulse: 0 }
const COMMON: SeenRarity = { lead: 0, rarity: 'common', tint: null, pulse: 0 }
/** Tier t sells at 10·t a unit. */
const unitPriceOf = (tier: number) => fromSafeInteger(10 * tier)

function kind(tier: number, key: string, count: number, rarity: SeenRarity | null): HeldKind {
  return { tier, key, name: key, rarity, count }
}

function saleOf(sold: readonly HeldKind[], liningPaid: string, tick: number): ReceiptSale {
  const credits = sold.reduce((total, k) => total + 10 * k.tier * k.count, 0)
  return { sold, credits: fromSafeInteger(credits), liningPaid: fromCanonical(liningPaid), tick }
}

function receiptOf(...sales: ReceiptSale[]): TripReceipt {
  return sales.reduce<TripReceipt | null>(
    (receipt, sale) => receiptWithSale(receipt, sale, unitPriceOf),
    null,
  ) as TripReceipt
}

describe('trip receipt', () => {
  it("prices each kind at its tier's unit price and totals the credits less the bill", () => {
    const receipt = receiptOf(saleOf([kind(3, 'a', 2, RARE), kind(5, 'b', 1, null)], '7', 100))
    expect(receipt.lines.map((line) => toCanonical(line.coin))).toEqual(['6e+1', '5e+1'])
    expect(toCanonical(receipt.credits)).toBe('1.1e+2')
    expect(toCanonical(receipt.net)).toBe('1.03e+2')
  })

  it('gathers two sales of one trip, merging a kind both sold', () => {
    const receipt = receiptOf(
      saleOf([kind(3, 'a', 2, null)], '0', 100),
      saleOf([kind(3, 'a', 1, RARE), kind(4, 'c', 1, null)], '0', 130),
    )
    expect(receipt.lines.map((line) => [line.key, line.count])).toEqual([
      ['a', 3],
      ['c', 1],
    ])
    expect(receipt.lines[0].rarity).toEqual(RARE)
    expect(toCanonical(receipt.net)).toBe('1.3e+2')
    expect(toCanonical(receipt.rollFrom)).toBe('6e+1')
    expect(receipt.lastSaleTick).toBe(130)
  })

  it('groups the lines rarest first, the unseen last, the largest coin first in each', () => {
    const receipt = receiptOf(
      saleOf([kind(2, 'x', 1, null), kind(3, 'c', 1, COMMON), kind(4, 'r1', 1, RARE)], '0', 1),
      saleOf([kind(6, 'r2', 1, RARE), kind(5, 'c2', 1, COMMON)], '0', 2),
    )
    const groups = rarityGroupsOf(receipt.lines)
    expect(groups.map((group) => group.rarity?.rarity ?? null)).toEqual(['rare', 'common', null])
    expect(groups.map((group) => group.lines.map((line) => line.key))).toEqual([
      ['r2', 'r1'],
      ['c2', 'c'],
      ['x'],
    ])
  })

  it('rolls the total up in at most 1.2 s and ends exactly on the net', () => {
    const receipt = receiptOf(saleOf([kind(7, 'a', 3, null)], '1.5', 100))
    expect(RECEIPT.roll.maxTicks).toBeLessThanOrEqual(72)
    expect(rollStepAt(receipt, 100)).toBe(0)
    expect(rolledTotalAt(receipt, 0)).toEqual(ZERO_MONEY)
    const done = rollStepAt(receipt, 100 + RECEIPT.roll.maxTicks)
    expect(isRollDone(done)).toBe(true)
    expect(toCanonical(rolledTotalAt(receipt, done))).toBe(toCanonical(receipt.net))
  })

  it('never shows more than the net on the way up', () => {
    const receipt = receiptOf(saleOf([kind(7, 'a', 3, null)], '1.333', 100))
    for (let step = 0; step <= RECEIPT.roll.steps; step++) {
      const shown = rolledTotalAt(receipt, step)
      expect(cmp(shown, receipt.net)).toBeLessThanOrEqual(0)
    }
  })

  it('reaches the same step at 30 and 144 frames a second', () => {
    const receipt = receiptOf(saleOf([kind(7, 'a', 3, null)], '0', 100))
    const stepAfter = (framesPerSecond: number, seconds: number) => {
      let step = 0
      for (let frame = 0; frame <= seconds * framesPerSecond; frame++) {
        step = rollStepAt(receipt, 100 + Math.floor((frame * 60) / framesPerSecond))
      }
      return step
    }
    expect(stepAfter(30, 0.5)).toBe(stepAfter(144, 0.5))
  })

  it('starts a later sale of the trip from the total shown before it', () => {
    const receipt = receiptOf(
      saleOf([kind(3, 'a', 2, null)], '0', 100),
      saleOf([kind(4, 'c', 1, null)], '0', 300),
    )
    expect(toCanonical(rolledTotalAt(receipt, rollStepAt(receipt, 300)))).toBe('6e+1')
  })

  it('compares the trip with the last one, and says nothing on the first trip', () => {
    const net = fromSafeInteger(100)
    expect(tripCompareOf(net, null)).toBeNull()
    expect(tripCompareOf(net, fromSafeInteger(90))).toBe('up')
    expect(tripCompareOf(net, fromSafeInteger(110))).toBe('down')
    expect(tripCompareOf(net, fromSafeInteger(100))).toBe('level')
  })
})
